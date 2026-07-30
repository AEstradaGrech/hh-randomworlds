// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CharacterRecovery
 * @notice Escrow + timelock ("staking") for dead character NFTs.
 *
 * Lifecycle
 *   1. Character dies in the off-chain story  -> backend signs a death attestation
 *   2. Player (or backend) calls recordDeath() -> character is unplayable
 *   3. Player calls stake()                    -> NFT is escrowed here, unlockAt is set
 *   4. After COOLDOWN, player calls unstake()  -> NFT returns, death record cleared
 *
 * The game backend gates play on isPlayable(tokenId).
 */
contract CharacterRecovery is IERC721Receiver, ReentrancyGuard, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    struct StakeInfo {
        address owner;    // who deposited it, and who can pull it back
        uint64  unlockAt; // timestamp after which unstake() is allowed
    }

    IERC721 public immutable characters;

    /// @notice address whose signature the contract accepts as proof of death
    address public gameSigner;

    /// @notice how long a dead character must sit in escrow
    uint64 public cooldown = 3 days;

    mapping(uint256 tokenId => StakeInfo) public stakes;
    mapping(uint256 tokenId => uint64 timestamp) public diedAt;
    /// @notice monotonic per-token counter, prevents replaying an old death signature
    mapping(uint256 tokenId => uint256) public deathNonce;
    /// @notice cumulative deaths — useful later as a dynamic trait (scars, veteran status)
    mapping(uint256 tokenId => uint32) public deathCount;

    event Died(uint256 indexed tokenId, uint256 nonce);
    event Staked(uint256 indexed tokenId, address indexed owner, uint64 unlockAt);
    event Unstaked(uint256 indexed tokenId, address indexed owner);

    error NotDead();
    error AlreadyDead();
    error AlreadyStaked();
    error NotStaked();
    error NotYourStake();
    error StillLocked(uint64 unlockAt);
    error BadSignature();
    error NoDirectTransfers();

    constructor(address characters_, address gameSigner_, address owner_) Ownable(owner_) {
        characters = IERC721(characters_);
        gameSigner = gameSigner_;
    }

    // ---------------------------------------------------------------- admin

    function setGameSigner(address signer) external onlyOwner {
        gameSigner = signer;
    }

    function setCooldown(uint64 seconds_) external onlyOwner {
        cooldown = seconds_;
    }

    // ---------------------------------------------------------------- death

    /**
     * @notice Flag a character as dead. Anyone may submit, but only a signature
     *         from `gameSigner` over (this contract, chainid, tokenId, nonce)
     *         is accepted — so a player cannot forge or suppress a death.
     * @dev The nonce binds the signature to exactly one death for one token.
     */
    function recordDeath(uint256 tokenId, uint256 nonce, bytes calldata signature) external {
        if (diedAt[tokenId] != 0) revert AlreadyDead();
        if (nonce != deathNonce[tokenId]) revert BadSignature();

        bytes32 digest = keccak256(
            abi.encode(address(this), block.chainid, tokenId, nonce)
        ).toEthSignedMessageHash();

        if (digest.recover(signature) != gameSigner) revert BadSignature();

        unchecked {
            deathNonce[tokenId] = nonce + 1;
            deathCount[tokenId] += 1;
        }
        diedAt[tokenId] = uint64(block.timestamp);

        emit Died(tokenId, nonce);
    }

    // -------------------------------------------------------------- staking

    /**
     * @notice Escrow a dead character to begin its recovery.
     * @dev Player must call characters.approve(address(this), tokenId) — or
     *      setApprovalForAll — first. We *pull* the token rather than accepting
     *      a push, so state is always written in the same transaction.
     */
    function stake(uint256 tokenId) external nonReentrant {
        if (diedAt[tokenId] == 0) revert NotDead();
        if (stakes[tokenId].owner != address(0)) revert AlreadyStaked();

        uint64 unlockAt = uint64(block.timestamp) + cooldown;
        stakes[tokenId] = StakeInfo({owner: msg.sender, unlockAt: unlockAt});

        // transferFrom reverts unless msg.sender is the owner or is approved,
        // so this is also the ownership check.
        characters.transferFrom(msg.sender, address(this), tokenId);

        emit Staked(tokenId, msg.sender, unlockAt);
    }

    /// @notice Withdraw after the cooldown; the character is alive again.
    function unstake(uint256 tokenId) external nonReentrant {
        StakeInfo memory s = stakes[tokenId];
        if (s.owner == address(0)) revert NotStaked();
        if (s.owner != msg.sender) revert NotYourStake();
        if (block.timestamp < s.unlockAt) revert StillLocked(s.unlockAt);

        // effects before interactions
        delete stakes[tokenId];
        delete diedAt[tokenId];

        characters.safeTransferFrom(address(this), msg.sender, tokenId);

        emit Unstaked(tokenId, msg.sender);
    }

    // ----------------------------------------------------------------- views

    /// @notice What the game backend calls before letting a session start.
    function isPlayable(uint256 tokenId) external view returns (bool) {
        return diedAt[tokenId] == 0 && stakes[tokenId].owner == address(0);
    }

    function timeRemaining(uint256 tokenId) external view returns (uint64) {
        uint64 unlockAt = stakes[tokenId].unlockAt;
        if (unlockAt == 0 || block.timestamp >= unlockAt) return 0;
        return unlockAt - uint64(block.timestamp);
    }

    // ------------------------------------------------------------- receiver

    /**
     * @dev Reject direct safeTransferFrom pushes. Everything must go through
     *      stake(), otherwise a token could land here with no stake record and
     *      be permanently stuck.
     */
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert NoDirectTransfers();
    }
}
