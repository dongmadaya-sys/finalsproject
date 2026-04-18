/**
 * Advanced Data Analysis Module for Smart Noise Monitor
 * Provides comprehensive analysis of noise monitoring data
 * Includes explanations of all UI components and additional analysis methods
 */

const DataAnalysis = {
  /**
   * GAUGES - Real-time Noise Level Indicators
   *
   * Purpose: Provide instant visual feedback of current noise conditions
   * - Average Gauge: Shows the current average noise level across all devices (or selected device)
   * - Peak Gauge: Shows the highest noise level detected in the current measurement period
   *
   * Color Coding:
   * - Cyan (0-60 dB): Safe/quiet levels
   * - Amber (60-80 dB): Warning levels - approaching threshold
   * - Red (80+ dB): Critical levels - exceeds acceptable noise limits
   *
   * Use Cases:
   * - Quick assessment of current library noise state
   * - Alert staff to immediate noise issues
   * - Monitor effectiveness of noise reduction measures
   */
  analyzeGaugeData(currentAvg, currentPeak, threshold = 65) {
    const analysis = {
      status: 'normal',
      recommendations: [],
      riskLevel: 'low'
    };

    // Analyze average noise level
    if (currentAvg >= threshold) {
      analysis.status = 'warning';
      analysis.recommendations.push('Current average noise exceeds threshold - investigate source');
    }

    // Analyze peak noise level
    if (currentPeak >= threshold + 15) {
      analysis.status = 'critical';
      analysis.riskLevel = 'high';
      analysis.recommendations.push('Peak noise significantly above threshold - immediate intervention required');
    } else if (currentPeak >= threshold) {
      analysis.status = 'warning';
      analysis.riskLevel = 'medium';
      analysis.recommendations.push('Peak noise at or above threshold - monitor closely');
    }

    // Time-based analysis
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 9 && hour <= 17) { // Business hours
      analysis.recommendations.push('During peak library hours - maintain strict noise control');
    }

    return analysis;
  },

  /**
   * LIVE NOISE CHARTS - Real-time Trend Visualization
   *
   * Purpose: Show continuous noise level trends over the last 30 data points
   * - X-axis: Time (last 30 measurements)
   * - Y-axis: Noise level in dB (0-120 range)
   * - Line shows real-time noise fluctuations
   *
   * Features:
   * - Smooth curve interpolation for trend visibility
   * - Auto-scrolling to show latest data
   * - Multi-device support with device selection
   * - Interactive tooltips showing exact values and timestamps
   *
   * Use Cases:
   * - Identify sudden noise spikes
   * - Monitor noise patterns during events
   * - Track effectiveness of interventions
   * - Detect gradual noise level changes
   */
  analyzeLiveChartData(chartData, deviceId) {
    if (!chartData || !chartData.datasets || chartData.datasets.length === 0) {
      return { status: 'no_data', message: 'Waiting for live data...' };
    }

    const analysis = {
      trend: 'stable',
      volatility: 'low',
      peaks: [],
      average: 0,
      deviceId: deviceId
    };

    // Extract data points
    const dataPoints = chartData.datasets[0].data;
    if (dataPoints.length < 2) return analysis;

    // Calculate average
    analysis.average = dataPoints.reduce((sum, val) => sum + val, 0) / dataPoints.length;

    // Analyze trend (slope of recent points)
    const recent = dataPoints.slice(-5); // Last 5 points
    if (recent.length >= 2) {
      const slope = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
      if (slope > 2) analysis.trend = 'increasing';
      else if (slope < -2) analysis.trend = 'decreasing';
    }

    // Calculate volatility (standard deviation)
    const variance = dataPoints.reduce((sum, val) => sum + Math.pow(val - analysis.average, 2), 0) / dataPoints.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > 15) analysis.volatility = 'high';
    else if (stdDev > 8) analysis.volatility = 'medium';

    // Identify peaks (values above threshold)
    const threshold = 65; // Default threshold
    analysis.peaks = dataPoints
      .map((val, idx) => ({ value: val, index: idx }))
      .filter(point => point.value >= threshold);

    return analysis;
  },

  /**
   * DAILY TRENDS CHART - 24-Hour Noise Pattern Analysis
   *
   * Purpose: Analyze noise patterns over the past 24 hours
   * - Average Line: Shows average noise level throughout the day
   * - Peak Line: Shows maximum noise spikes during each period
   * - High Noise Bars: Highlights periods where peak noise exceeded threshold
   *
   * Analysis Features:
   * - Peak hours identification
   * - Noise pattern recognition (morning rush, lunch breaks, evening quiet)
   * - Threshold violation tracking
   * - Trend analysis across the day
   *
   * Use Cases:
   * - Schedule staffing based on noise patterns
   * - Identify problematic time periods
   * - Evaluate daily noise management effectiveness
   * - Compare day-to-day noise patterns
   */
  analyzeDailyTrends(dailyData, threshold = 65) {
    const analysis = {
      peakHours: [],
      quietHours: [],
      violations: 0,
      averageNoise: 0,
      pattern: 'normal',
      recommendations: []
    };

    if (!dailyData || !dailyData.labels || dailyData.labels.length === 0) {
      return { ...analysis, status: 'no_data' };
    }

    const avgData = dailyData.datasets[0].data;
    const peakData = dailyData.datasets[1].data;
    const violationData = dailyData.datasets[2].data;

    // Calculate overall statistics
    analysis.averageNoise = avgData.reduce((sum, val) => sum + val, 0) / avgData.length;
    analysis.violations = violationData.filter(val => val !== null).length;

    // Identify peak and quiet hours
    const timeSlots = dailyData.labels.map((label, idx) => ({
      time: label,
      avg: avgData[idx],
      peak: peakData[idx],
      violated: violationData[idx] !== null
    }));

    // Find peak hours (top 3 highest average noise periods)
    analysis.peakHours = timeSlots
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3)
      .map(slot => ({ time: slot.time, noise: slot.avg }));

    // Find quiet hours (bottom 3 lowest average noise periods)
    analysis.quietHours = timeSlots
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 3)
      .map(slot => ({ time: slot.time, noise: slot.avg }));

    // Pattern recognition
    const morningAvg = avgData.slice(0, Math.floor(avgData.length / 3)).reduce((a, b) => a + b, 0) / Math.floor(avgData.length / 3);
    const afternoonAvg = avgData.slice(Math.floor(avgData.length / 3), Math.floor(2 * avgData.length / 3)).reduce((a, b) => a + b, 0) / Math.floor(avgData.length / 3);
    const eveningAvg = avgData.slice(Math.floor(2 * avgData.length / 3)).reduce((a, b) => a + b, 0) / (avgData.length - Math.floor(2 * avgData.length / 3));

    if (afternoonAvg > morningAvg * 1.5) {
      analysis.pattern = 'afternoon_peak';
      analysis.recommendations.push('High afternoon noise - consider additional staffing during lunch hours');
    } else if (morningAvg > afternoonAvg * 1.2) {
      analysis.pattern = 'morning_rush';
      analysis.recommendations.push('Morning rush period identified - prepare for opening hours');
    }

    if (analysis.violations > avgData.length * 0.3) {
      analysis.recommendations.push('High frequency of threshold violations - review noise policies');
    }

    return analysis;
  },

  /**
   * MONTHLY OVERVIEW CHART - Long-term Trend Analysis
   *
   * Purpose: Analyze noise patterns over multiple days/weeks
   * - Average Line: Daily average noise levels
   * - Peak Line: Daily maximum noise levels
   * - Shows trends across days, weeks, or months
   *
   * Analysis Features:
   * - Long-term trend identification (increasing/decreasing/stable)
   * - Weekly pattern recognition
   * - Seasonal variations
   * - Overall noise management effectiveness
   *
   * Use Cases:
   * - Evaluate long-term noise reduction strategies
   * - Identify seasonal or weekly patterns
   * - Plan resource allocation based on historical data
   * - Generate reports for library administration
   */
  analyzeMonthlyOverview(monthlyData) {
    const analysis = {
      trend: 'stable',
      weeklyPattern: 'consistent',
      bestDay: null,
      worstDay: null,
      averageNoise: 0,
      recommendations: []
    };

    if (!monthlyData || !monthlyData.labels || monthlyData.labels.length === 0) {
      return { ...analysis, status: 'no_data' };
    }

    const avgData = monthlyData.datasets[0].data;
    const peakData = monthlyData.datasets[1].data;

    // Calculate overall average
    analysis.averageNoise = avgData.reduce((sum, val) => sum + val, 0) / avgData.length;

    // Analyze long-term trend
    if (avgData.length >= 7) {
      const firstHalf = avgData.slice(0, Math.floor(avgData.length / 2));
      const secondHalf = avgData.slice(Math.floor(avgData.length / 2));

      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

      if (changePercent > 10) analysis.trend = 'increasing';
      else if (changePercent < -10) analysis.trend = 'decreasing';
    }

    // Find best and worst days
    const dayStats = monthlyData.labels.map((label, idx) => ({
      date: label,
      avg: avgData[idx],
      peak: peakData[idx]
    }));

    analysis.bestDay = dayStats.reduce((best, current) =>
      current.avg < best.avg ? current : best
    );

    analysis.worstDay = dayStats.reduce((worst, current) =>
      current.avg > worst.avg ? current : worst
    );

    // Weekly pattern analysis (if we have enough data)
    if (avgData.length >= 7) {
      const weeklyAvgs = [];
      for (let i = 0; i < avgData.length; i += 7) {
        const week = avgData.slice(i, i + 7);
        weeklyAvgs.push(week.reduce((a, b) => a + b, 0) / week.length);
      }

      if (weeklyAvgs.length >= 2) {
        const weekVariance = weeklyAvgs.reduce((sum, val) =>
          sum + Math.pow(val - analysis.averageNoise, 2), 0
        ) / weeklyAvgs.length;

        if (weekVariance > 25) {
          analysis.weeklyPattern = 'variable';
          analysis.recommendations.push('Significant week-to-week variations - investigate causes');
        }
      }
    }

    // Generate recommendations based on analysis
    if (analysis.trend === 'increasing') {
      analysis.recommendations.push('Noise levels trending upward - review recent changes or events');
    } else if (analysis.trend === 'decreasing') {
      analysis.recommendations.push('Positive trend: noise levels decreasing - continue current strategies');
    }

    return analysis;
  },

  /**
   * COMPREHENSIVE SYSTEM ANALYSIS - Combines all data sources
   *
   * Purpose: Provide a complete analysis of the noise monitoring system
   * Combines real-time, daily, and monthly data for comprehensive insights
   *
   * Returns integrated analysis with:
   * - Current status assessment
   * - Trend analysis across timeframes
   * - Actionable recommendations
   * - Risk assessment
   */
  performComprehensiveAnalysis(gaugeData, liveChartData, dailyData, monthlyData, deviceId) {
    const comprehensive = {
      timestamp: new Date().toISOString(),
      deviceId: deviceId,
      overallStatus: 'normal',
      riskLevel: 'low',
      insights: [],
      recommendations: [],
      components: {}
    };

    try {
      // Analyze each component
      comprehensive.components.gauges = this.analyzeGaugeData(
        gaugeData?.avg || 0,
        gaugeData?.peak || 0
      );

      comprehensive.components.liveChart = this.analyzeLiveChartData(liveChartData, deviceId);
      comprehensive.components.dailyTrends = this.analyzeDailyTrends(dailyData);
      comprehensive.components.monthlyOverview = this.analyzeMonthlyOverview(monthlyData);

      // Determine overall status based on worst component
      const statuses = [
        comprehensive.components.gauges.status,
        comprehensive.components.liveChart.trend === 'increasing' ? 'warning' : 'normal',
        comprehensive.components.dailyTrends.violations > 0 ? 'warning' : 'normal'
      ];

      if (statuses.includes('critical')) {
        comprehensive.overallStatus = 'critical';
        comprehensive.riskLevel = 'high';
      } else if (statuses.includes('warning')) {
        comprehensive.overallStatus = 'warning';
        comprehensive.riskLevel = 'medium';
      }

      // Generate insights
      if (comprehensive.components.liveChart.volatility === 'high') {
        comprehensive.insights.push('High noise volatility detected - inconsistent noise levels');
      }

      if (comprehensive.components.dailyTrends.violations > 0) {
        comprehensive.insights.push(`${comprehensive.components.dailyTrends.violations} threshold violations in the last 24 hours`);
      }

      if (comprehensive.components.monthlyOverview.trend === 'increasing') {
        comprehensive.insights.push('Long-term noise trend is increasing - requires attention');
      }

      // Compile recommendations from all components
      comprehensive.recommendations = [
        ...comprehensive.components.gauges.recommendations,
        ...comprehensive.components.dailyTrends.recommendations,
        ...comprehensive.components.monthlyOverview.recommendations
      ].filter((rec, idx, arr) => arr.indexOf(rec) === idx); // Remove duplicates

      console.log('[DATA_ANALYSIS] Comprehensive analysis completed for device:', deviceId);
      return comprehensive;

    } catch (error) {
      console.error('[DATA_ANALYSIS] Error in comprehensive analysis:', error.message);
      return {
        ...comprehensive,
        error: error.message,
        overallStatus: 'error'
      };
    }
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataAnalysis;
} else if (typeof window !== 'undefined') {
  window.DataAnalysis = DataAnalysis;
}