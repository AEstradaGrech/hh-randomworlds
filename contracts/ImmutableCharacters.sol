// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";                     // NEW
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol"; // NEW

/// @notice Minimal view of the non-transferable soft token (WORDS).
///         It can only be BURNED — it cannot be transferred into this contract —
///         so a shard purchase is a sink, never revenue.
interface IWords {
    function burnFrom(address account, uint256 amount) external;
}

/// @title ImmutableCharacters
/// @notice Character collection. Redeem credits are bought with ETH (revenue)
///         or by burning soft tokens (a sink). A credit is minted into an NFT
///         only against a tokenURI signed by the backend, so a caller cannot
///         redeem metadata the backend never generated.
contract ImmutableCharacters is ERC721URIStorage, Ownable2Step, ReentrancyGuard {
    using ECDSA for bytes32;                 // NEW
    using MessageHashUtils for bytes32;      // NEW

    // ------------------------------------------------------------- config
    string  private _baseURIExtended;
    uint256 public  weiMintPrice;   // character price in ETH (wei)
    uint256 public  maxMints;       // 0 = unlimited
    bool    public  isAvailable;

    /// @notice soft token accepted for WORD purchases (address(0) = disabled)
    IWords public wordsToken;
    /// @notice WORD base units required per 1 ETH of weiMintPrice.
    uint256 public wordsExchangeRate;

    /// @notice backend key whose signature authorises a tokenURI for redemption // NEW
    address public signer;                                                        // NEW

    // -------------------------------------------------------------- state
    uint256 private _tokenId;
    mapping(address => uint256) private _purchases;      // redeem credits
    mapping(bytes32 => bool)    public  redeemed;        // NEW: spent tickets

    // ------------------------------------------------------------- events
    event PurchasedWithEther(address indexed buyer, uint256 price);
    event PurchasedWithWords(address indexed buyer, uint256 shardsBurned);
    event Redeemed(address indexed buyer, uint256 indexed tokenId, string uri);
    event MintPriceUpdated(uint256 weiPrice);
    event WordConfigUpdated(address token, uint256 exchangeRate);
    event SignerUpdated(address signer);                 // NEW
    event Withdrawn(address indexed to, uint256 amount);

    // ------------------------------------------------------------- errors
    error SoldOut();
    error WrongEtherAmount();
    error WordsDisabled();
    error NoPurchases();
    error EmptyURI();
    error BadSignature();       // NEW
    error TicketUsed();         // NEW
    error TransferFailed();

    constructor(
        address ownerAddress,
        string memory tokenName,
        string memory symbol,
        uint256 mintPrice,
        uint256 allowedMints
    ) ERC721(tokenName, symbol) Ownable(ownerAddress) {
        weiMintPrice = mintPrice;
        maxMints = allowedMints;
        isAvailable = true;
        _baseURIExtended = "ipfs://";
    }

    // -------------------------------------------------------------- admin
    function resetBaseURI(string calldata newUri) external onlyOwner {
        if (bytes(newUri).length == 0) revert EmptyURI();
        _baseURIExtended = newUri;
    }

    function setMintPrice(uint256 weiPrice) external onlyOwner {
        weiMintPrice = weiPrice;
        emit MintPriceUpdated(weiPrice);
    }

    function setAvailable(bool available) external onlyOwner {
        isAvailable = available;
    }

    function setWordsConfig(address token, uint256 exchangeRate) external onlyOwner {
        wordsToken = IWords(token);
        wordsExchangeRate = exchangeRate;
        emit WordConfigUpdated(token, exchangeRate);
    }

    /// @notice Set the backend key that signs redeemable tokenURIs.       // NEW
    function setSigner(address newSigner) external onlyOwner {             // NEW
        signer = newSigner;                                                // NEW
        emit SignerUpdated(newSigner);                                     // NEW
    }                                                                      // NEW

    // ---------------------------------------------------------- purchasing
    function etherPurchase() external payable {
        if (!isAvailable) revert SoldOut();
        if (msg.value != weiMintPrice) revert WrongEtherAmount();
        _purchases[msg.sender]++;
        emit PurchasedWithEther(msg.sender, msg.value);
    }

    /// @notice Buy a redeem credit by burning soft tokens. Caller must first
    ///         approve this contract (or sign an ERC20Permit) for shardPrice().
    function wordsPurchase() external nonReentrant {
        if (!isAvailable) revert SoldOut();
        if (address(wordsToken) == address(0)) revert WordsDisabled();

        uint256 cost = wordPrice();
        _purchases[msg.sender]++;               // effect before interaction
        wordsToken.burnFrom(msg.sender, cost);  // reverts if allowance/balance short
        emit PurchasedWithWords(msg.sender, cost);
    }

    /**
     * @notice Redeem a paid credit into an NFT, using a tokenURI the backend
     *         produced and signed after the IPFS upload succeeded.
     * @dev The signature binds the URI to (this contract, chain, caller), so a
     *      ticket cannot be replayed on another collection, chain, or by another
     *      user; `redeemed` stops the same ticket being used twice.
     */
    function redeemNFT(string calldata metadataUri, bytes calldata signature) external { // CHANGED
        if (_purchases[msg.sender] == 0) revert NoPurchases();
        if (bytes(metadataUri).length == 0) revert EmptyURI();

        bytes32 digest = keccak256(                                                       // NEW
            abi.encode(address(this), block.chainid, msg.sender, keccak256(bytes(metadataUri)))
        ).toEthSignedMessageHash();

        if (redeemed[digest]) revert TicketUsed();                                        // NEW
        if (digest.recover(signature) != signer) revert BadSignature();                   // NEW

        redeemed[digest] = true;                                                          // NEW
        _purchases[msg.sender]--;
        _mintNFT(msg.sender, metadataUri);
    }

    // ---------------------------------------------------------- withdrawal
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(to, amount);
    }

    // -------------------------------------------------------------- views
    function wordPrice() public view returns (uint256) {
        return (weiMintPrice * wordsExchangeRate) / 1 ether;
    }

    function availablePurchases() external view returns (uint256) {
        return _purchases[msg.sender];
    }

    function totalMints() external view returns (uint256) {
        return _tokenId;
    }

    // ------------------------------------------------------------ internal
    function _baseURI() internal view override returns (string memory) {
        return _baseURIExtended;
    }

    function _mintNFT(address collector, string memory metadataUri) private {
        _tokenId++;
        _safeMint(collector, _tokenId);
        _setTokenURI(_tokenId, metadataUri);
        emit Redeemed(collector, _tokenId, metadataUri);
        if (maxMints > 0 && _tokenId >= maxMints) {
            isAvailable = false;
        }
    }
}