// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.20;

interface ILPPluginFactory {
    /**
     * @notice Deploys a new LPPlugin instance.
     * @dev Only the owner can call this function.
     * @param pool The address of the Algebra pool to associate with the plugin.
     * @return plugin The address of the deployed LPPlugin instance.
     */
    function deploy(address pool) external returns (address plugin);
    function WNativeToken() external returns (address);
    function lpTokenFactory() external returns(address);
}
