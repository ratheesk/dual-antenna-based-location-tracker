import React, { useState, useEffect } from 'react';
import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Local Gaussian curve fitting function (since axios/server isn't available)
const gaussianFit = (data) => {
  if (data.length < 3) return null;

  const x = data.map((p) => p.angle);
  const y = data.map((p) => p.rssi);

  // Simple gaussian approximation
  const baseline = Math.min(...y);
  const amplitude = Math.max(...y) - baseline;
  const maxIndex = y.indexOf(Math.max(...y));
  const center = x[maxIndex];
  const sigma = 15; // Approximate beam width

  // Generate fitted curve points with more density for smooth curve
  const fittedCurve = [];
  for (let angle = 0; angle <= 180; angle += 0.5) {
    // Increased density
    const rssi =
      baseline +
      amplitude * Math.exp(-Math.pow(angle - center, 2) / (2 * sigma * sigma));
    fittedCurve.push({ angle, fitted: rssi, rssi: null }); // rssi: null to avoid scatter points
  }

  // Find peak from fitted curve
  const peakPoint = fittedCurve.reduce((max, point) =>
    point.fitted > max.fitted ? point : max
  );

  // Calculate FWHM (Full Width at Half Maximum)
  const halfMax = baseline + amplitude / 2;
  let leftPoint = 0,
    rightPoint = 180;

  for (let i = 0; i < fittedCurve.length; i++) {
    if (fittedCurve[i].fitted >= halfMax) {
      leftPoint = fittedCurve[i].angle;
      break;
    }
  }

  for (let i = fittedCurve.length - 1; i >= 0; i--) {
    if (fittedCurve[i].fitted >= halfMax) {
      rightPoint = fittedCurve[i].angle;
      break;
    }
  }

  const beamWidth = rightPoint - leftPoint;

  return {
    fittedCurve,
    bestAngle: {
      angle: peakPoint.angle,
      rssi: peakPoint.fitted,
    },
    parameters: {
      baseline,
      amplitude,
      center: peakPoint.angle, // Use actual fitted peak
      sigma,
      peakRssi: peakPoint.fitted,
      beamWidth: beamWidth.toFixed(1),
    },
  };
};

const LiveChart = ({
  boardId,
  chartData,
  finalData = null,
  isTracking = false,
  showDetails = false,
  onBestAngleUpdate,
}) => {
  const [serverResult, setServerResult] = useState(null);

  // Only perform curve fitting when scan is complete (180/181 degrees) or final data received
  useEffect(() => {
    const dataToFit =
      finalData && finalData.angles && finalData.rssi
        ? finalData.angles.map((angle, i) => ({
            angle,
            rssi: finalData.rssi[i],
          }))
        : chartData;

    // Trigger curve fitting when:
    // 1. We have at least 3 data points AND
    // 2. Either we reached 180/181 degrees OR received final data
    if (
      dataToFit.length >= 3 &&
      ((chartData.length > 0 &&
        (chartData[chartData.length - 1].angle === 180 ||
          chartData[chartData.length - 1].angle === 181)) ||
        (finalData && finalData.angles))
    ) {
      // Use local curve fitting instead of server
      const result = gaussianFit(dataToFit);
      if (result) {
        setServerResult(result);
        if (onBestAngleUpdate && result.bestAngle.angle !== -1) {
          onBestAngleUpdate(boardId, result.bestAngle);
        }
      }
    }
    // Clear curve fitting if we're back to scanning (data reset)
    else if (chartData.length === 0) {
      setServerResult(null);
    }
  }, [chartData, finalData, boardId, onBestAngleUpdate]);

  const displayData =
    finalData && finalData.angles && finalData.rssi
      ? finalData.angles.map((angle, i) => ({ angle, rssi: finalData.rssi[i] }))
      : chartData;

  const fittedCurve = serverResult?.fittedCurve || [];
  const bestAngle =
    serverResult?.bestAngle ||
    (() => {
      if (displayData.length === 0) return { angle: -1, rssi: -999 };
      let maxPoint = { angle: -1, rssi: -999 };
      displayData.forEach((p) => {
        if (p.rssi > maxPoint.rssi) maxPoint = p;
      });
      return maxPoint;
    })();
  const parameters = serverResult?.parameters || null;
  const isFinalAnalysis = !!serverResult;

  // Combine data for chart rendering - merge measured data with fitted curve
  const combinedData = [];
  const maxAngle = Math.max(180, ...displayData.map((d) => d.angle));

  // Create a comprehensive dataset
  const allAngles = new Set();

  // Add all measured data angles
  displayData.forEach((d) => allAngles.add(d.angle));

  // Add fitted curve angles if available
  if (fittedCurve.length > 0) {
    fittedCurve.forEach((d) => allAngles.add(d.angle));
  }

  // Sort angles and create combined data
  Array.from(allAngles)
    .sort((a, b) => a - b)
    .forEach((angle) => {
      const dataPoint = displayData.find(
        (d) => Math.abs(d.angle - angle) < 0.1
      );
      const fittedPoint = fittedCurve.find(
        (d) => Math.abs(d.angle - angle) < 0.1
      );

      combinedData.push({
        angle,
        rssi: dataPoint?.rssi || null,
        fitted: fittedPoint?.fitted || null,
        isPeak:
          bestAngle.angle !== -1 && Math.abs(angle - bestAngle.angle) < 0.5
            ? bestAngle.rssi
            : null,
      });
    });

  const getChartTitle = () => {
    if (isTracking) return 'Live RSSI Scanning';
    if (isFinalAnalysis) return 'Scan Complete - Gaussian Curve Fitted';
    return 'RSSI Direction Finding';
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-bold text-purple-300">
            {getChartTitle()}
          </h3>
          {isTracking && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-400">Scanning...</span>
            </div>
          )}
          {isFinalAnalysis && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span className="text-xs text-blue-400">Curve Fitted</span>
            </div>
          )}
        </div>
        <div className="text-sm text-purple-400">
          {isFinalAnalysis ? 'Fitted Peak:' : 'Current Max:'}{' '}
          {bestAngle.angle !== -1 ? `${bestAngle.angle.toFixed(1)}°` : 'N/A'}
          {isFinalAnalysis && bestAngle.rssi !== -999
            ? ` (${bestAngle.rssi.toFixed(1)} dBm)`
            : ''}
          {parameters && ` | FWHM: ${parameters.beamWidth}°`}
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 bg-gray-900/50 rounded-lg p-3 border border-purple-500/30">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={combinedData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#6b46c1"
              opacity={0.3}
            />
            <XAxis
              dataKey="angle"
              type="number"
              domain={[0, 'dataMax']}
              stroke="#c4b5fd"
              tick={{ fill: '#c4b5fd', fontSize: 10 }}
              label={{
                value: 'Angle (°)',
                position: 'insideBottom',
                offset: -5,
                fill: '#c4b5fd',
              }}
            />
            <YAxis
              stroke="#c4b5fd"
              tick={{ fill: '#c4b5fd', fontSize: 10 }}
              label={{
                value: 'RSSI (dBm)',
                angle: -90,
                position: 'insideLeft',
                fill: '#c4b5fd',
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #6b46c1',
                borderRadius: '6px',
                color: '#c4b5fd',
              }}
              formatter={(value, name) => {
                if (name === 'rssi' && value !== null)
                  return [`${value.toFixed(1)} dBm`, 'RSSI'];
                if (name === 'fitted' && value !== null)
                  return [`${value.toFixed(1)} dBm`, 'Fitted'];
                if (name === 'isPeak' && value !== null)
                  return [`${value.toFixed(1)} dBm`, 'Peak'];
                return [null, ''];
              }}
              labelFormatter={(angle) => `Angle: ${angle}°`}
            />
            <Legend wrapperStyle={{ color: '#c4b5fd', fontSize: 12 }} />

            {/* Measured RSSI Points */}
            <Scatter
              name={isFinalAnalysis ? 'Measured RSSI' : 'Live RSSI'}
              dataKey="rssi"
              fill={boardId === 'board1' ? '#8b5cf6' : '#ec4899'}
              shape="circle"
            />

            {/* Gaussian Fit Line */}
            {isFinalAnalysis && (
              <Line
                name="Gaussian Fit"
                type="monotone"
                dataKey="fitted"
                stroke={boardId === 'board1' ? '#3b82f6' : '#f97316'}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            )}

            {/* Peak Point */}
            {bestAngle.angle !== -1 && (
              <Scatter
                name={isFinalAnalysis ? 'Predicted Peak' : 'Source Max'}
                dataKey="isPeak"
                fill={
                  isFinalAnalysis
                    ? boardId === 'board1'
                      ? '#22d3ee'
                      : '#fbbf24'
                    : boardId === 'board1'
                    ? '#10b981'
                    : '#f59e0b'
                }
                shape={isFinalAnalysis ? 'star' : 'diamond'}
                size={100}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Parameters Display */}
      {showDetails && parameters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-gray-900/30 rounded border border-purple-500/20">
          <div className="text-center">
            <div className="text-xs text-purple-300">Peak RSSI</div>
            <div className="font-mono text-sm text-white">
              {parameters.peakRssi.toFixed(1)} dBm
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-purple-300">Peak Angle</div>
            <div className="font-mono text-sm text-white">
              {parameters.center.toFixed(1)}°
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-purple-300">Beam Width</div>
            <div className="font-mono text-sm text-white">
              {parameters.beamWidth}°
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-purple-300">Amplitude</div>
            <div className="font-mono text-sm text-white">
              {parameters.amplitude.toFixed(1)} dB
            </div>
          </div>
        </div>
      )}

      {/* Data Summary */}
      {showDetails && displayData.length > 0 && (
        <div className="flex justify-between text-xs text-purple-400 bg-gray-900/20 p-2 rounded">
          <span>Data Points: {displayData.length}</span>
          <span>
            Range: {Math.min(...displayData.map((d) => d.angle))}° -{' '}
            {Math.max(...displayData.map((d) => d.angle))}°
          </span>
          <span>
            RSSI Range: {Math.min(...displayData.map((d) => d.rssi)).toFixed(1)}{' '}
            to {Math.max(...displayData.map((d) => d.rssi)).toFixed(1)} dBm
          </span>
        </div>
      )}
    </div>
  );
};

export default LiveChart;
