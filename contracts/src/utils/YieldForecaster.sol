// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ISY.sol";
import "../interfaces/IYieldStrategy.sol";

/**
 * @title YieldForecaster
 * @dev Portfolio analytics and yield forecasting for DeFi strategies
 * Tracks performance and provides projected returns
 */
contract YieldForecaster is Ownable {
    
    // Historical data tracking
    struct YieldSnapshot {
        uint256 timestamp;
        uint256 apy;
        uint256 totalValue;
        uint256 yieldGenerated;
    }
    
    struct StrategyPerformance {
        address strategy;
        uint256 totalYieldGenerated;
        uint256 averageAPY;
        uint256 peakAPY;
        uint256 lowestAPY;
        uint256 volatilityScore;
        uint256 lastUpdate;
        YieldSnapshot[] snapshots;
    }
    
    // Portfolio analytics
    struct PortfolioMetrics {
        uint256 totalValue;
        uint256 totalYieldGenerated;
        uint256 weightedAPY;
        uint256 riskScore;
        uint256 sharpeRatio;
        uint256 performanceScore;
    }
    
    // Storage
    mapping(address => StrategyPerformance) public strategyPerformance;
    address[] public trackedStrategies;
    mapping(address => bool) public isTracked;
    
    // Forecasting parameters
    uint256 public constant SNAPSHOT_INTERVAL = 1 hours;
    uint256 public constant MAX_SNAPSHOTS = 168; // 1 week of hourly data
    uint256 public constant VOLATILITY_WINDOW = 24; // 24 hour window for volatility
    
    // Events
    event StrategyAdded(address indexed strategy);
    event SnapshotTaken(address indexed strategy, uint256 apy, uint256 value);
    event ForecastGenerated(address indexed strategy, uint256 projectedAPY, uint256 confidence);
    
    constructor(address _owner) Ownable(_owner) {}
    
    // Add strategy for tracking
    function addStrategy(address _strategy) external onlyOwner {
        require(_strategy != address(0), "Invalid strategy");
        require(!isTracked[_strategy], "Already tracked");
        
        trackedStrategies.push(_strategy);
        isTracked[_strategy] = true;
        
        // Initialize with current data
        StrategyPerformance storage perf = strategyPerformance[_strategy];
        perf.strategy = _strategy;
        perf.lastUpdate = block.timestamp;
        
        // Take initial snapshot
        _takeSnapshot(_strategy);
        
        emit StrategyAdded(_strategy);
    }
    
    // Update strategy performance data
    function updateStrategy(address _strategy) external {
        require(isTracked[_strategy], "Strategy not tracked");
        
        StrategyPerformance storage perf = strategyPerformance[_strategy];
        
        // Only update if enough time has passed
        if (block.timestamp >= perf.lastUpdate + SNAPSHOT_INTERVAL) {
            _takeSnapshot(_strategy);
            _updateMetrics(_strategy);
            perf.lastUpdate = block.timestamp;
        }
    }
    
    function _takeSnapshot(address _strategy) internal {
        IYieldStrategy strategy = IYieldStrategy(_strategy);
        StrategyPerformance storage perf = strategyPerformance[_strategy];
        
        uint256 currentAPY = strategy.getCurrentAPY();
        uint256 currentValue = strategy.balanceOf();
        uint256 currentYield = strategy.pendingYield();
        
        // Add new snapshot
        perf.snapshots.push(YieldSnapshot({
            timestamp: block.timestamp,
            apy: currentAPY,
            totalValue: currentValue,
            yieldGenerated: currentYield
        }));
        
        // Remove old snapshots if we exceed max
        if (perf.snapshots.length > MAX_SNAPSHOTS) {
            // Shift array left to remove oldest snapshot
            for (uint256 i = 0; i < perf.snapshots.length - 1; i++) {
                perf.snapshots[i] = perf.snapshots[i + 1];
            }
            perf.snapshots.pop();
        }
        
        emit SnapshotTaken(_strategy, currentAPY, currentValue);
    }
    
    function _updateMetrics(address _strategy) internal {
        StrategyPerformance storage perf = strategyPerformance[_strategy];
        
        if (perf.snapshots.length == 0) return;
        
        uint256 totalAPY = 0;
        uint256 totalYield = 0;
        uint256 minAPY = type(uint256).max;
        uint256 maxAPY = 0;
        
        // Calculate metrics from snapshots
        for (uint256 i = 0; i < perf.snapshots.length; i++) {
            YieldSnapshot memory snapshot = perf.snapshots[i];
            
            totalAPY += snapshot.apy;
            totalYield += snapshot.yieldGenerated;
            
            if (snapshot.apy < minAPY) minAPY = snapshot.apy;
            if (snapshot.apy > maxAPY) maxAPY = snapshot.apy;
        }
        
        // Update performance metrics
        perf.averageAPY = totalAPY / perf.snapshots.length;
        perf.peakAPY = maxAPY;
        perf.lowestAPY = minAPY == type(uint256).max ? 0 : minAPY;
        perf.totalYieldGenerated = totalYield;
        
        // Calculate volatility score (simplified standard deviation)
        perf.volatilityScore = _calculateVolatility(_strategy);
    }
    
    function _calculateVolatility(address _strategy) internal view returns (uint256) {
        StrategyPerformance storage perf = strategyPerformance[_strategy];
        
        if (perf.snapshots.length < 2) return 0;
        
        uint256 mean = perf.averageAPY;
        uint256 variance = 0;
        uint256 count = 0;
        
        // Calculate variance over recent snapshots
        uint256 startIndex = perf.snapshots.length > VOLATILITY_WINDOW ? 
            perf.snapshots.length - VOLATILITY_WINDOW : 0;
        
        for (uint256 i = startIndex; i < perf.snapshots.length; i++) {
            uint256 apy = perf.snapshots[i].apy;
            uint256 diff = apy > mean ? apy - mean : mean - apy;
            variance += diff * diff;
            count++;
        }
        
        return count > 0 ? variance / count : 0;
    }
    
    // Forecasting functions
    function generateForecast(address _strategy, uint256 _timeHorizon) external view returns (
        uint256 projectedAPY,
        uint256 confidenceScore,
        uint256 minExpected,
        uint256 maxExpected
    ) {
        require(isTracked[_strategy], "Strategy not tracked");
        
        StrategyPerformance storage perf = strategyPerformance[_strategy];
        
        if (perf.snapshots.length < 3) {
            // Insufficient data for forecasting
            uint256 currentAPY = IYieldStrategy(_strategy).getCurrentAPY();
            return (currentAPY, 30, currentAPY * 80 / 100, currentAPY * 120 / 100);
        }
        
        // Simple trend analysis
        uint256 recentWindow = perf.snapshots.length >= 24 ? 24 : perf.snapshots.length;
        uint256 trendSum = 0;
        uint256 trendCount = 0;
        
        for (uint256 i = perf.snapshots.length - recentWindow; i < perf.snapshots.length - 1; i++) {
            if (perf.snapshots[i + 1].apy > perf.snapshots[i].apy) {
                trendSum += perf.snapshots[i + 1].apy - perf.snapshots[i].apy;
            }
            trendCount++;
        }
        
        uint256 averageTrend = trendCount > 0 ? trendSum / trendCount : 0;
        uint256 baseAPY = perf.averageAPY;
        
        // Project APY based on trend
        projectedAPY = baseAPY + (averageTrend * _timeHorizon) / (24 * 3600); // Scale by time
        
        // Calculate confidence based on data quality and volatility
        uint256 dataQuality = (perf.snapshots.length * 100) / MAX_SNAPSHOTS;
        uint256 stabilityScore = perf.volatilityScore > 0 ? 
            (baseAPY * 100) / perf.volatilityScore : 100;
        
        confidenceScore = (dataQuality + stabilityScore) / 2;
        if (confidenceScore > 100) confidenceScore = 100;
        
        // Calculate expected range
        uint256 volatilityRange = (perf.volatilityScore * projectedAPY) / (baseAPY > 0 ? baseAPY : 1);
        minExpected = projectedAPY > volatilityRange ? projectedAPY - volatilityRange : 0;
        maxExpected = projectedAPY + volatilityRange;
        
        return (projectedAPY, confidenceScore, minExpected, maxExpected);
    }
    
    function getPortfolioAnalytics(address[] calldata _strategies, uint256[] calldata _allocations) 
        external view returns (PortfolioMetrics memory metrics) {
        require(_strategies.length == _allocations.length, "Mismatched arrays");
        
        uint256 totalAllocation = 0;
        uint256 weightedAPY = 0;
        uint256 totalValue = 0;
        uint256 totalYield = 0;
        uint256 totalVolatility = 0;
        
        for (uint256 i = 0; i < _strategies.length; i++) {
            if (!isTracked[_strategies[i]]) continue;
            
            StrategyPerformance storage perf = strategyPerformance[_strategies[i]];
            uint256 allocation = _allocations[i];
            
            totalAllocation += allocation;
            weightedAPY += (perf.averageAPY * allocation) / 10000;
            totalValue += (IYieldStrategy(_strategies[i]).balanceOf() * allocation) / 10000;
            totalYield += perf.totalYieldGenerated;
            totalVolatility += (perf.volatilityScore * allocation) / 10000;
        }
        
        // Calculate risk score (inverse of stability)
        uint256 riskScore = totalVolatility > 0 ? 
            (totalVolatility * 100) / (weightedAPY > 0 ? weightedAPY : 1) : 0;
        
        // Calculate Sharpe ratio (simplified: return/risk)
        uint256 sharpeRatio = riskScore > 0 ? (weightedAPY * 100) / riskScore : weightedAPY;
        
        // Performance score combines yield and stability
        uint256 performanceScore = sharpeRatio > 100 ? 100 : sharpeRatio;
        
        return PortfolioMetrics({
            totalValue: totalValue,
            totalYieldGenerated: totalYield,
            weightedAPY: weightedAPY,
            riskScore: riskScore,
            sharpeRatio: sharpeRatio,
            performanceScore: performanceScore
        });
    }
    
    // Get historical data for strategy
    function getStrategyHistory(address _strategy, uint256 _limit) external view returns (
        YieldSnapshot[] memory snapshots
    ) {
        require(isTracked[_strategy], "Strategy not tracked");
        
        StrategyPerformance storage perf = strategyPerformance[_strategy];
        uint256 length = perf.snapshots.length;
        uint256 returnLength = _limit > 0 && _limit < length ? _limit : length;
        
        snapshots = new YieldSnapshot[](returnLength);
        
        for (uint256 i = 0; i < returnLength; i++) {
            snapshots[i] = perf.snapshots[length - returnLength + i];
        }
        
        return snapshots;
    }
    
    // Get strategy performance summary
    function getStrategyPerformance(address _strategy) external view returns (
        uint256 averageAPY,
        uint256 peakAPY,
        uint256 lowestAPY,
        uint256 volatilityScore,
        uint256 totalYield,
        uint256 dataPoints
    ) {
        require(isTracked[_strategy], "Strategy not tracked");
        
        StrategyPerformance storage perf = strategyPerformance[_strategy];
        
        return (
            perf.averageAPY,
            perf.peakAPY,
            perf.lowestAPY,
            perf.volatilityScore,
            perf.totalYieldGenerated,
            perf.snapshots.length
        );
    }
    
    // Batch update all tracked strategies
    function updateAllStrategies() external {
        for (uint256 i = 0; i < trackedStrategies.length; i++) {
            address strategy = trackedStrategies[i];
            StrategyPerformance storage perf = strategyPerformance[strategy];
            
            if (block.timestamp >= perf.lastUpdate + SNAPSHOT_INTERVAL) {
                _takeSnapshot(strategy);
                _updateMetrics(strategy);
                perf.lastUpdate = block.timestamp;
            }
        }
    }
    
    // Remove strategy from tracking
    function removeStrategy(address _strategy) external onlyOwner {
        require(isTracked[_strategy], "Strategy not tracked");
        
        // Find and remove from array
        for (uint256 i = 0; i < trackedStrategies.length; i++) {
            if (trackedStrategies[i] == _strategy) {
                trackedStrategies[i] = trackedStrategies[trackedStrategies.length - 1];
                trackedStrategies.pop();
                break;
            }
        }
        
        isTracked[_strategy] = false;
        delete strategyPerformance[_strategy];
    }
    
    // Get all tracked strategies
    function getTrackedStrategies() external view returns (address[] memory) {
        return trackedStrategies;
    }
}