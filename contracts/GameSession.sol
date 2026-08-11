// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.34;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface ILockableCharacter {
    function locked(uint256 tokenId) external view returns (bool);
    function lock(uint256 tokenId, uint64 until) external;
    function unlock(uint256 tokenId) external;
}
/// @notice WORDS soft token as a collection sees it: soulbound (burn-only),
///         with permit() so a buy skips the separate approve tx.
interface IWords {
    function mint(address to, uint256 amount) external;
}
/**
 * @title GameSession
 * @notice One deployment for the whole studio. Owns the session lifecycle,
 *         the entry fee, the payout accounting and the death cooldown.
 *
 *   startGame()  player pays the fee, character is locked indefinitely
 *   settle()     backend-signed outcome:
 *                  WIN   -> payout credited, character unlocked
 *                  DRAW  -> nothing,         character unlocked
 *                  LOSS  -> nothing,         character locked for recoveryCooldown
 *   withdraw()   player pulls their credited winnings
 */
contract GameSession is Ownable2Step, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    enum Outcome { NONE, WIN, DRAW, LOSS }

    struct Session {
        address player;
        uint96  wager;     // what the player paid, packs with `player`
        uint64  startedAt;
        uint64  epoch;     // per-character session counter, binds the signature
    }

    // ------------------------------------------------------------- config
    IWords  public wordsToken;         // address(0) = WORDS disabled
    address public gameSigner;
    uint256 public entryFee            = 0.01 ether;
    uint256 public wordsReward         = 1 ether;
    uint16  public winMultiplierBps    = 10_000;  // 100% of the wager on a win
    uint64  public recoveryCooldown    = 3 days;
    uint64  public sessionTimeout      = 7 days;  // anti-brick escape hatch

    mapping(address collection => bool) public allowedCollections;

    // -------------------------------------------------------------- state

    mapping(bytes32 key => Session) public sessions;
    mapping(bytes32 key => uint64)  public epochOf;   // survives session deletion
    mapping(address player => uint256) public pending; // pull-payment credits

    /// @notice ether promised to open sessions in the worst case (all wins)
    uint256 public reserved;
    /// @notice ether already credited to players but not yet withdrawn
    uint256 public totalPending;

    // ------------------------------------------------------------- events

    event GameStarted(bytes32 indexed key, address indexed player, address collection, uint256 tokenId, uint64 epoch, uint256 wager);
    event GameSettled(bytes32 indexed key, address indexed player, Outcome outcome, uint256 payout);
    event GameAbandoned(bytes32 indexed key, address indexed player);
    event Withdrawn(address indexed player, uint256 amount);
    event WordsRewarded(address indexed player, uint256 amount);
    event WordsRewardFailed(address indexed player, uint256 amount);
    event WordsConfigUpdated(address token, uint256 rewardPoints);

    // ------------------------------------------------------------- errors

    error CollectionNotAllowed();
    error WrongFee();
    error NotCharacterOwner();
    error CharacterBusy();
    error CharacterRecovering();
    error NoSession();
    error BadSignature();
    error BadOutcome();
    error Insolvent();
    error TooEarly();
    error NothingToWithdraw();
    error TransferFailed();

    constructor(address owner_, address gameSigner_, uint256 gameFee_, uint16 winMultiplier_, uint64 recoveryCooldown_, uint64 sessionTimeout_) Ownable(owner_) {
        gameSigner = gameSigner_;
        entryFee = gameFee_;
        winMultiplierBps = winMultiplier_;
        recoveryCooldown = recoveryCooldown_;
        sessionTimeout = sessionTimeout_;
    }

    // -------------------------------------------------------------- admin

    function setGameSigner(address s) external onlyOwner { gameSigner = s; }
    function setEntryFee(uint256 f) external onlyOwner { entryFee = f; }
    function setWinMultiplierBps(uint16 b) external onlyOwner { winMultiplierBps = b; }
    function setRecoveryCooldown(uint64 c) external onlyOwner { recoveryCooldown = c; }
    function setSessionTimeout(uint64 t) external onlyOwner { sessionTimeout = t; }
    function setCollection(address collection, bool allowed) external onlyOwner { allowedCollections[collection] = allowed; }
    function setWordsConfig(address token, uint256 rewardPoints) external onlyOwner {
        wordsToken = IWords(token);
        wordsReward = rewardPoints;
        emit WordsConfigUpdated(token, rewardPoints);
    }
    /// @notice top up the prize float
    function fund() external payable {}

    /// @notice the house can only take what is not owed to anyone
    /// Reading that syntax: call returns (bool success, bytes memory returndata) and the empty second slot discards the returndata you don't need.
    /// The "" is the calldata — empty, meaning no function selector, which is what triggers the recipient's receive(). 
    /// By default it forwards all remaining gas.
    function sweep(address to, uint256 amount) external onlyOwner nonReentrant {
        if (amount > _freeBalance()) revert Insolvent();
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ---------------------------------------------------------- lifecycle

    function startGame(address collection, uint256 tokenId) external payable nonReentrant {
        if (!allowedCollections[collection]) revert CollectionNotAllowed();
        if (msg.value != entryFee) revert WrongFee();
        if (IERC721(collection).ownerOf(tokenId) != msg.sender) revert NotCharacterOwner();

        bytes32 key = getKey(collection, tokenId);
        if (sessions[key].player != address(0)) revert CharacterBusy();
        // a dead character is still locked; that lock is what enforces the cooldown
        if (ILockableCharacter(collection).locked(tokenId)) revert CharacterRecovering();

        uint256 maxPayout = (msg.value * winMultiplierBps) / 10_000;
        // msg.value is already in address(this).balance here
        if (address(this).balance < totalPending + reserved + maxPayout) revert Insolvent();
        reserved += maxPayout;

        uint64 epoch = ++epochOf[key];
        sessions[key] = Session({
            player: msg.sender,
            wager: uint96(msg.value),
            startedAt: uint64(block.timestamp),
            epoch: epoch
        });

        ILockableCharacter(collection).lock(tokenId, type(uint64).max);

        emit GameStarted(key, msg.sender, collection, tokenId, epoch, msg.value);
    }

    /**
     * @notice Apply the outcome your backend decided. Anyone may submit the
     *         transaction — the signature is the authority — so the winner can
     *         pay their own gas and your hot wallet never needs ether.
     */
    function settle(
        address collection,
        uint256 tokenId,
        Outcome outcome,
        bytes calldata signature
    ) external nonReentrant {
        if (outcome == Outcome.NONE) revert BadOutcome();

        bytes32 key = getKey(collection, tokenId);
        Session memory s = sessions[key];
        if (s.player == address(0)) revert NoSession();

        bytes32 digest = keccak256(
            abi.encode(address(this), block.chainid, collection, tokenId, s.epoch, outcome)
        ).toEthSignedMessageHash();
        if (digest.recover(signature) != gameSigner) revert BadSignature();

        uint256 maxPayout = (uint256(s.wager) * winMultiplierBps) / 10_000;
        reserved -= maxPayout;
        delete sessions[key];

        uint256 payout = 0;
        if (outcome == Outcome.WIN) {
            payout = maxPayout;
            pending[s.player] += payout;
            totalPending += payout;
            _rewardWithWords(s.player, 5_000);
            ILockableCharacter(collection).unlock(tokenId);
        } else if (outcome == Outcome.DRAW) {
            _rewardWithWords(s.player, 10_000);
            ILockableCharacter(collection).unlock(tokenId);
        } else {
            // LOSS: the character dies and serves its cooldown in the wallet
            ILockableCharacter(collection).lock(tokenId, uint64(block.timestamp) + recoveryCooldown);
        }

        emit GameSettled(key, s.player, outcome, payout);
    }

    /**
     * @notice Escape hatch: if the backend never settles, the player can free
     *         their character after sessionTimeout. Treated as a draw with no
     *         refund — refunding here would let a player dodge death by simply
     *         walking away from a losing story.
     */
    function abandon(address collection, uint256 tokenId) external nonReentrant {
        bytes32 key = getKey(collection, tokenId);
        Session memory s = sessions[key];
        if (s.player == address(0)) revert NoSession();
        if (s.player != msg.sender) revert NotCharacterOwner();
        if (block.timestamp < s.startedAt + sessionTimeout) revert TooEarly();

        reserved -= (uint256(s.wager) * winMultiplierBps) / 10_000;
        delete sessions[key];

        ILockableCharacter(collection).unlock(tokenId);
        emit GameAbandoned(key, msg.sender);
    }

    // ------------------------------------------------------------ payouts

    function withdraw() external nonReentrant {
        uint256 amount = pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pending[msg.sender] = 0;
        totalPending -= amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    function _rewardWithWords(address receiver, uint256 rewardBps) internal {
        if (address(wordsToken) == address(0) || wordsReward == 0) return;
        uint256 amount = wordsReward * rewardBps / 10_000;
        if (amount == 0) return;                         // e.g. bps == 0, nothing to mint
        try wordsToken.mint(receiver, amount) {
            emit WordsRewarded(receiver, amount);        // ✅ the real amount
        } catch {
            emit WordsRewardFailed(receiver, amount);
        }
    }
    // -------------------------------------------------------------- views

    function isPlayable(address collection, uint256 tokenId) external view returns (bool) {
        bytes32 key = getKey(collection, tokenId);
        return sessions[key].player == address(0)
            && !ILockableCharacter(collection).locked(tokenId);
    }

    function _freeBalance() internal view returns (uint256) {
        uint256 owed = totalPending + reserved;
        return address(this).balance > owed ? address(this).balance - owed : 0;
    }

    function getKey(address collection, uint256 tokenId) public pure returns (bytes32) {
        return keccak256(abi.encode(collection, tokenId));
    }
}
