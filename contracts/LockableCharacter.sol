// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.34;

import {ERC721URIStorage, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IERC6982 {
    event DefaultLocked(bool locked);
    event Locked(uint256 indexed tokenId, bool locked);
    function defaultLocked() external view returns (bool);
    function locked(uint256 tokenId) external view returns (bool);
}

/// @notice WORDS soft token as a collection sees it: soulbound (burn-only),
///         with permit() so a buy skips the separate approve tx.
interface IWords {
    function burnFrom(address account, uint256 amount) external;
    function permit(address owner, address spender, uint256 value,
                    uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
}

/// @title LockableCharacter
/// @notice Shared base for BOTH character contracts: ERC-6982 self-lock,
///         ETH withdrawal, and WORDS purchasing (permit + burn).
abstract contract LockableCharacter is ERC721URIStorage, Ownable2Step, IERC6982 {
    address public locker;                          // GameSession, the only locker
    mapping(uint256 => uint64) public lockedUntil;  // 0 = free

    IWords  public wordsToken;         // address(0) = WORDS disabled
    uint256 public wordsExchangeRate;  // WORDS base units per 1 ETH of price
    string  private _baseURIExtended;

    error NotLocker();
    error CharacterLocked(uint256 tokenId, uint64 until);
    error WordsDisabled();
    error TransferFailed();
    error EmptyValue();

    event WordsConfigUpdated(address token, uint256 exchangeRate);
    event Withdrawn(address indexed to, uint256 amount);

    modifier onlyLocker() {
        if (msg.sender != locker) revert NotLocker();
        _;
    }

    constructor(address owner_, string memory name_, string memory symbol_)
        ERC721(name_, symbol_) Ownable(owner_)
    {
        _baseURIExtended = "ipfs://";
        emit DefaultLocked(false);
    }

    function setLocker(address locker_) external onlyOwner { locker = locker_; }

    function setBaseURI(string calldata uri) external onlyOwner {
        if (bytes(uri).length == 0) revert EmptyValue();
        _baseURIExtended = uri;
    }

    function setWordsConfig(address token, uint256 exchangeRate) external onlyOwner {
        wordsToken = IWords(token);
        wordsExchangeRate = exchangeRate;
        emit WordsConfigUpdated(token, exchangeRate);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(to, amount);
    }

    // ERC-6982
    function defaultLocked() public pure returns (bool) { return false; }
    function locked(uint256 tokenId) public view returns (bool) {
        return block.timestamp < lockedUntil[tokenId];
    }
    function lock(uint256 tokenId, uint64 until) external onlyLocker {
        lockedUntil[tokenId] = until; emit Locked(tokenId, true);
    }
    function unlock(uint256 tokenId) external onlyLocker {
        delete lockedUntil[tokenId]; emit Locked(tokenId, false);
    }

    // WORDS purchasing (shared)
    function wordsPrice(uint256 weiPrice) public view returns (uint256) {
        return (weiPrice * wordsExchangeRate) / 1 ether;
    }
    /// @dev permit → single-tx approval; try/catch so an already-consumed
    ///      (front-run) permit can't brick the buy when an allowance exists.
    function _collectWords(address from, uint256 cost,
                           uint256 deadline, uint8 v, bytes32 r, bytes32 s) internal {
        if (address(wordsToken) == address(0)) revert WordsDisabled();
        // Consume the signature to set the allowance. permit(from, address(this), cost, ...) tells 
        // the WORDS token: "from authorized this collection to spend cost." Now the contract has an allowance — with no separate approve tx.
        try wordsToken.permit(from, address(this), cost, deadline, v, r, s) {} catch {}
        wordsToken.burnFrom(from, cost);
    }

    // overrides
    function _baseURI() internal view override returns (string memory) { return _baseURIExtended; }

    function _update(address to, uint256 tokenId, address auth)
        internal virtual override returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && locked(tokenId)) revert CharacterLocked(tokenId, lockedUntil[tokenId]);
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 id) public view virtual override(ERC721URIStorage) returns (bool) {
        return id == type(IERC6982).interfaceId || super.supportsInterface(id);
    }
}