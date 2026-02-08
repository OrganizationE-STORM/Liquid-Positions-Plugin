// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.20;

interface ILPPluginFactory {
    /**
     * @notice Deploys a new LPPlugin instance.
     * @dev Only the owner can call this function.
     * @param pool The address of the Algebra pool to associate with the plugin.
     * @param _pluginFee Fee percentage to calculate on the pool fee.
     *                  If the pool fee is 10000 (0.01%), and the plugin fee is 5000 (0.05%),
     *                  the plugin will receive 0.05% of the 0.01% pool fee.
     * @return plugin The address of the deployed LPPlugin instance.
     */
    function deploy(
        address pool,
        uint24 _pluginFee
    ) external returns (address plugin);

    function WNativeToken() external returns (address);

    function lpTokenFactory() external returns (address);
}
