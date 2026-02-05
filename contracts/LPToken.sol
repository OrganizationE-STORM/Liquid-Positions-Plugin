// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

// Import ERC20 standard implementation from OpenZeppelin
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// Import Ownable from OpenZeppelin to manage ownership-based access control
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LPToken
 * @notice ERC20 token representing a share of liquidity provided in a pool.
 *         Only the owner (e.g., the LPPlugin contract) can mint or burn tokens.
 */
contract LPToken is ERC20, Ownable {
    /**
     * @notice Constructor initializes the ERC20 token with a name and symbol
     *         and sets the deployer as the initial owner.
     * @param name Token name
     * @param symbol Token symbol
     */
    constructor(
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) Ownable(msg.sender) {}

    /**
     * @notice Mint new LP tokens to a user
     * @dev Only callable by the contract owner (typically the LPPlugin)
     * @param to Address receiving the minted tokens
     * @param amount Number of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Burn LP tokens from a user
     * @dev Only callable by the contract owner (typically the LPPlugin)
     * @param from Address whose tokens will be burned
     * @param amount Number of tokens to burn
     */
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
