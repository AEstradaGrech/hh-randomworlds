// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {LockableCharacter} from "./LockableCharacter.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @notice Unique, per-user characters. A paid credit (ETH or WORDS) becomes an
///         NFT only against a backend-signed tokenURI.
contract ImmutableCharacters is LockableCharacter {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    uint256 public weiMintPrice;
    uint256 public maxMints;   // 0 = unlimited
    bool    public isAvailable;
    address public signer;     // backend key authorising tokenURIs

    uint256 private _tokenId;
    mapping(address => uint256) private _purchases;
    mapping(bytes32 => bool)    public  redeemed;

    event PurchasedWithEther(address indexed buyer, uint256 price);
    event PurchasedWithWords(address indexed buyer, uint256 burned);
    event Redeemed(address indexed buyer, uint256 indexed tokenId, string uri);
    event MintPriceUpdated(uint256 weiPrice);
    event SignerUpdated(address signer);

    error SoldOut(); error WrongEtherAmount(); error NoPurchases();
    error EmptyURI(); error BadSignature(); error TicketUsed();

    constructor(address owner_, string memory name_, string memory symbol_,
                uint256 mintPrice, uint256 allowedMints)
        LockableCharacter(owner_, name_, symbol_)
    {
        weiMintPrice = mintPrice; maxMints = allowedMints; isAvailable = true;
    }

    function setMintPrice(uint256 p) external onlyOwner { weiMintPrice = p; emit MintPriceUpdated(p); }
    function setAvailable(bool a) external onlyOwner { isAvailable = a; }
    function setSigner(address s) external onlyOwner { signer = s; emit SignerUpdated(s); }

    function etherPurchase() external payable {
        if (!isAvailable) revert SoldOut();
        if (msg.value != weiMintPrice) revert WrongEtherAmount();
        _purchases[msg.sender]++;
        emit PurchasedWithEther(msg.sender, msg.value);
    }

    /// @notice Buy a credit by burning WORDS; (deadline,v,r,s) is the ERC-2612 permit.
    function wordsPurchase(uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        if (!isAvailable) revert SoldOut();
        uint256 cost = wordsPrice(weiMintPrice);
        _purchases[msg.sender]++;
        _collectWords(msg.sender, cost, deadline, v, r, s);
        emit PurchasedWithWords(msg.sender, cost);
    }

    function redeemNFT(string calldata metadataUri, bytes calldata signature) external {
        if (_purchases[msg.sender] == 0) revert NoPurchases();
        if (bytes(metadataUri).length == 0) revert EmptyURI();
        bytes32 digest = keccak256(
            abi.encode(address(this), block.chainid, msg.sender, keccak256(bytes(metadataUri)))
        ).toEthSignedMessageHash();
        if (redeemed[digest]) revert TicketUsed();
        if (digest.recover(signature) != signer) revert BadSignature();

        redeemed[digest] = true;
        _purchases[msg.sender]--;
        _tokenId++;
        _safeMint(msg.sender, _tokenId);
        _setTokenURI(_tokenId, metadataUri);
        emit Redeemed(msg.sender, _tokenId, metadataUri);
        if (maxMints > 0 && _tokenId >= maxMints) isAvailable = false;
    }

    function availablePurchases() external view returns (uint256) { return _purchases[msg.sender]; }
    function totalMints() external view returns (uint256) { return _tokenId; }
}