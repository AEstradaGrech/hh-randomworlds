// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title GameShards
 * @notice Soft / in-game utility token for the Model A economy.
 *
 *  Design goals:
 *   - NOT listed, NOT tradeable. Wallet-to-wallet transfers are disabled, so
 *     there is literally no market to pump or dump. The only balance changes
 *     allowed are:
 *         mint (faucet)   address(0) -> player       [rewards on a win]
 *         burn (sink)     player     -> address(0)    [spent on revive / cosmetics]
 *   - Uncapped ON PURPOSE. Supply is held in check by the sink/faucet balance,
 *     not a hard cap. (A cap belongs on a *hard* token; this isn't one.)
 *   - Game contracts (e.g. GameSession) hold MINTER_ROLE to reward players.
 *     Sinks remove value with burnFrom(), authorised by an allowance or permit.
 */
contract SoftToken is ERC20, ERC20Burnable, ERC20Permit, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    error NonTransferable();

    constructor(address admin, string memory name, string memory symbol)
        ERC20(name, symbol)
        ERC20Permit(name)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Faucet. Only contracts holding MINTER_ROLE (e.g. GameSession on a
    ///         WIN) can create shards, minted straight into the player's wallet.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @dev Soulbound-style guard. In OpenZeppelin v5 every balance change routes
     *      through _update: `from == 0` is a mint, `to == 0` is a burn. We permit
     *      exactly those two and revert on anything else, which disables
     *      player-to-player transfers (and therefore any DEX pool). Sinks are
     *      unaffected because a burn sets `to == address(0)`.
     * 
     *      If you later want shards to move into specific game contracts (e.g. a shop that escrows them) rather 
     *      than only burning, change the guard from "block all peer transfers" to "allow transfers only when 
     *      from or to is an allowlisted game address." That keeps players from trading each other / listing on a DEX 
     *      while letting your own contracts hold shards.
     */
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) revert NonTransferable();
        super._update(from, to, value);
    }
}