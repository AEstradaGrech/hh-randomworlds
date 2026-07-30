// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.34;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice ERC-6982: Efficient Default Lockable Tokens. Final, and designed
///         precisely for "a pool locks the asset while the owner keeps it".
interface IERC6982 {
    event DefaultLocked(bool locked);
    event Locked(uint256 indexed tokenId, bool locked);

    function defaultLocked() external view returns (bool);
    function locked(uint256 tokenId) external view returns (bool);
}

/**
 * @title LockableCharacter
 * @notice Abstract ERC721 base: characters stay in the player's wallet but
 *         become non-transferable while locked. Inherit this from BOTH
 *         CollectionCharacters and CustomCharacters so the lock logic is
 *         written once and audited once.
 *
 * Two lock durations are used by the game:
 *   - in-game:   lock(tokenId, type(uint64).max)  -> released on settlement
 *   - dead:      lock(tokenId, now + cooldown)    -> expires by itself
 */
abstract contract LockableCharacter is ERC721URIStorage, Ownable, IERC6982 {
    /// @notice the GameSession contract, the only address allowed to lock
    address public locker;

    /// @notice 0 = free; otherwise the timestamp at which the lock lapses
    mapping(uint256 tokenId => uint64) public lockedUntil;

    error NotLocker();
    error CharacterLocked(uint256 tokenId, uint64 until);

    modifier onlyLocker() {
        if (msg.sender != locker) revert NotLocker();
        _;
    }

    constructor(address owner, string memory tokenName, string memory tokenSymbol)
    ERC721(tokenName, tokenSymbol)
    Ownable(owner) 
    {
        emit DefaultLocked(false);
        
    }

    function setLocker(address locker_) external onlyOwner {
        locker = locker_;
    }

    // ----------------------------------------------------------- ERC-6982

    function defaultLocked() public pure returns (bool) {
        return false;
    }

    function locked(uint256 tokenId) public view returns (bool) {
        return block.timestamp < lockedUntil[tokenId];
    }

    // -------------------------------------------------------------- locks

    function lock(uint256 tokenId, uint64 until) external onlyLocker {
        lockedUntil[tokenId] = until;
        emit Locked(tokenId, true);
    }

    function unlock(uint256 tokenId) external onlyLocker {
        delete lockedUntil[tokenId];
        emit Locked(tokenId, false);
    }

    // ---------------------------------------------------------- enforcement

    /**
     * @dev OZ v5 routes every mint, burn and transfer through _update.
     *      `from == address(0)` is a mint, which we always allow.
     *      Burning a locked character is blocked too — otherwise a player
     *      could destroy a dead character to dodge its cooldown.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && locked(tokenId)) {
            revert CharacterLocked(tokenId, lockedUntil[tokenId]);
        }
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override
        returns (bool)
    {
        return interfaceId == type(IERC6982).interfaceId
            || super.supportsInterface(interfaceId);
    }
}

/*
 * NOTE on strict ERC-6982 conformance:
 * because a death lock expires on a timestamp, `locked()` flips back to false
 * with no transaction and therefore no `Locked(tokenId, false)` event. Indexers
 * that trust events alone will show the character as locked until its next
 * transfer. If that matters for your marketplace listings, make recovery an
 * explicit call the player sends (a real "unstake") instead of a passive timer,
 * and emit the event there.
 */
