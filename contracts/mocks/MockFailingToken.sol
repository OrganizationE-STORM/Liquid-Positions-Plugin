// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockFailingToken
 * @notice ERC-20 token that can be configured to return false on approve/transfer
 */
contract MockFailingToken is ERC20 {
    bool public shouldFailApprove;
    bool public shouldFailTransfer;

    constructor(
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFailApprove(bool _shouldFail) external {
        shouldFailApprove = _shouldFail;
    }

    function setFailTransfer(bool _shouldFail) external {
        shouldFailTransfer = _shouldFail;
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        if (shouldFailApprove) {
            return false;
        }
        return super.approve(spender, amount);
    }

    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        if (shouldFailTransfer) {
            return false;
        }
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public virtual override returns (bool) {
        if (shouldFailTransfer) {
            return false;
        }
        return super.transferFrom(from, to, amount);
    }
}