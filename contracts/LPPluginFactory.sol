// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

// Import Ownable for ownership-based access control
import "@openzeppelin/contracts/access/Ownable.sol";
// Import LPPlugin to deploy new plugin instances
import "./LPPlugin.sol";
import "./interfaces/ILPPluginFactory.sol";
import "@cryptoalgebra/abstract-plugin/contracts/AbstractCustomPluginFactory.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title LPPluginFactory
 * @notice Factory contract to deploy instances of LPPlugin with access control.
 *         Only the owner can deploy new LPPlugin instances.
 */
contract LPPluginFactory is
    ILPPluginFactory,
    AbstractCustomPluginFactory,
    Ownable
{
    address public immutable WNativeToken;
    address public immutable lpTokenFactory;

    mapping (address => bool) public registry;

    /// @notice Emitted when a new LPPlugin instance is deployed
    /// @param pool The address of the associated Algebra Pool
    /// @param plugin The address of the newly deployed LPPlugin
    /// @param deployer The address that called the deploy function
    event PluginDeployed(
        address indexed pool,
        address indexed plugin,
        address indexed deployer
    );

    /**
     * @notice Constructor initializes Ownable with deployer as owner
     */
    constructor(
        address _entryPoint,
        address _WNativeToken,
        address _lpTokenFactory
    ) AbstractCustomPluginFactory(_entryPoint) Ownable(msg.sender) {
        WNativeToken = _WNativeToken;
        lpTokenFactory = _lpTokenFactory;
    }

    function setTickSpacing(
        address pool,
        int24 newTickSpacing
    ) external onlyOwner {
        IAlgebraCustomPoolEntryPoint(entryPoint).setTickSpacing(
            pool,
            newTickSpacing
        );
    }

    function setPlugin(
        address pool,
        address newPluginAddress
    ) external onlyOwner {
        require(registry[newPluginAddress], "plugin not registered");
        IAlgebraCustomPoolEntryPoint(entryPoint).setPlugin(
            pool,
            newPluginAddress
        );
    }

    function setPluginConfig(address pool, uint8 newConfig) external onlyOwner {
        IAlgebraCustomPoolEntryPoint(entryPoint).setPluginConfig(
            pool,
            newConfig
        );
    }

    function setFee(address pool, uint16 newFee) external onlyOwner {
        IAlgebraCustomPoolEntryPoint(entryPoint).setFee(pool, newFee);
    }

    function collectFee(
        address plugin,
        address token,
        uint256 maxAmount,
        address recipient
    ) external onlyOwner {
        require(registry[plugin], "plugin not registered");
        uint256 amount;
        uint256 pluginBalance = IERC20(token).balanceOf(plugin);
        if (pluginBalance < maxAmount) {
            amount = pluginBalance;
        } else {
            amount = maxAmount;
        }
        IAbstractPlugin(plugin).collectPluginFee(token, amount, recipient);
    }

    function setPluginFeeRate(
        address plugin,
        uint24 newFeeRate
    ) external onlyOwner {
        require(registry[plugin], "plugin not registered");
        LPPlugin(plugin).setPluginFeeRate(newFeeRate);
    }

    function _createPlugin(address pool) internal override returns (address) {
        LPPlugin plugin = new LPPlugin(pool, address(this));
        registry[address(plugin)] = true;
        return address(plugin);
    }

    /**
     * @notice Deploys a new LPPlugin instance for a specific pool
     * @dev Only callable by the owner of the factory
     * @param pool Address of the Algebra Pool this plugin will manage
     * @return plugin Address of the newly deployed LPPlugin instance
     */
    function deploy(address pool) external onlyOwner returns (address plugin) {
        // Deploy a new LPPlugin, passing the pool and the factory address
        LPPlugin instance = new LPPlugin(pool, address(this));
        plugin = address(instance);

        // Emit event to signal that a new plugin has been deployed
        emit PluginDeployed(pool, plugin, msg.sender);
        registry[plugin] = true;
        return plugin;
    }
}
