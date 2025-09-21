import React, { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { performCurveFitting, calculateR2 } from './curveFitting.jsx';

const LiveChart = ({ boardId, chartData, showDetails = false }) => {
  // Perform Gaussian curve fitting when data changes
  const { fittedCurve, bestAngle, parameters, quality } = useMemo(() => {
    if (chartData.length < 3) {
      return {
        fittedCurve: [],
        bestAngle: { angle: -1, rssi: 0 },
        parameters: null,
        quality: { error: 0, r2: 0 },
      };
    }

    const result = performCurveFitting(chartData, 'gaussian');
    const r2Value = calculateR2(chartData, result.fittedCurve);

    return {
      fittedCurve: result.fittedCurve || [],
      bestAngle: result.bestAngle,
      parameters: result.parameters,
      quality: { ...result.quality, r2: r2Value },
    };
  }, [chartData]);

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-purple-300">
          RSSI vs Angle (Gaussian Fit)
        </h3>
        <div className="text-sm text-purple-400">
          Best:{' '}
          {bestAngle.angle !== -1 ? `${bestAngle.angle.toFixed(1)}°` : 'N/A'}
          {parameters && ` | FWHM: ${parameters.beamWidth}°`}
        </div>
      </div>

      <div className="h-64 bg-gray-900/50 rounded-lg p-3 border border-purple-500/30">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#6b46c1"
              opacity={0.3}
            />
            <XAxis
              dataKey="angle"
              type="number"
              domain={[0, 180]}
              label={{
                value: 'Angle (degrees)',
                position: 'insideBottom',
                offset: -5,
                style: { fill: '#c4b5fd', fontSize: 12 },
              }}
              stroke="#c4b5fd"
              tick={{ fill: '#c4b5fd', fontSize: 10 }}
            />
            <YAxis
              dataKey="rssi"
              type="number"
              label={{
                value: 'RSSI (dBm)',
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#c4b5fd', fontSize: 12 },
              }}
              stroke="#c4b5fd"
              tick={{ fill: '#c4b5fd', fontSize: 10 }}
            />
            <Tooltip
              wrapperStyle={{ zIndex: 1000 }} // Ensure tooltip is on top
              contentStyle={{
                backgroundColor: '#1f2937', // Dark gray, fully opaque
                color: '#ffffff', // White text
                border: '1px solid #a78bfa', // Lighter purple border
                borderRadius: '6px',
                padding: '8px',
                fontSize: '14px',
                fontWeight: '500',
                boxShadow: '0 5px 15px rgba(139, 92, 246, 0.2)',
              }}
              itemStyle={{ color: '#ffffff' }} // Explicitly set item text color
              labelStyle={{
                color: '#ffffff',
                fontWeight: '500',
                fontSize: '14px',
              }}
              formatter={(value, name) => {
                if (name === 'rssi')
                  return [`${value.toFixed(1)} dBm`, 'Measured RSSI'];
                if (name === 'best')
                  return [`${value.toFixed(1)} dBm`, 'Predicted Peak'];
                return [`${value.toFixed(1)} dBm`, 'Gaussian Fit'];
              }}
              labelFormatter={(label) => `Angle: ${label}°`}
            />
            <Legend wrapperStyle={{ color: '#c4b5fd', fontSize: 12 }} />

            {/* Measured data points */}
            <Scatter
              name="Measured RSSI"
              data={chartData}
              fill={boardId === 'board1' ? '#8b5cf6' : '#ec4899'}
              shape="circle"
              opacity={0.8}
              size={6}
            />

            {/* Gaussian fitted curve */}
            {fittedCurve.length > 0 && (
              <Line
                name="Gaussian Fit"
                type="monotone"
                dataKey="rssi"
                data={fittedCurve}
                stroke={boardId === 'board1' ? '#3b82f6' : '#f97316'}
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
            )}

            {/* Best angle marker (predicted peak) */}
            {bestAngle.angle !== -1 && (
              <Scatter
                name="Predicted Peak"
                data={[bestAngle]}
                fill={boardId === 'board1' ? '#22d3ee' : '#fbbf24'}
                shape="star"
                size={15}
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Gaussian fit parameters display */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="space-y-1">
          <div className="text-purple-400">Fit Quality:</div>
          <div className="text-purple-300">R² = {quality.r2.toFixed(3)}</div>
          <div className="text-purple-300">Points: {chartData.length}</div>
        </div>
        {parameters && (
          <div className="space-y-1">
            <div className="text-purple-400">Beam Pattern:</div>
            <div className="text-purple-300">
              Peak: {parameters.peakRssi} dBm
            </div>
            <div className="text-purple-300">
              Width: {parameters.beamWidth}° FWHM
            </div>
          </div>
        )}
      </div>

      {/* Detailed parameters (optional) */}
      {showDetails && parameters && (
        <div className="bg-gray-800/50 rounded p-2 text-xs space-y-1 border border-purple-500/20">
          <div className="text-purple-400 font-medium">
            Gaussian Parameters:
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <div>Center: {parameters.center}°</div>
            <div>Amplitude: {parameters.amplitude} dB</div>
            <div>Sigma: {parameters.sigma}°</div>
            <div>Baseline: {parameters.baseline} dBm</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveChart;
