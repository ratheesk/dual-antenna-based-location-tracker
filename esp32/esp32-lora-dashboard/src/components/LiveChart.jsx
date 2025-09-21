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

const LiveChart = ({
  boardId,
  chartData,
  finalData = null,
  isTracking = false,
  showDetails = false,
  onBestAngleUpdate,
}) => {
  // Only perform curve fitting when we have final data (rotation complete)
  const { fittedCurve, bestAngle, parameters, quality, isFinalAnalysis } =
    useMemo(() => {
      // If we have final data, use it for curve fitting
      if (finalData && finalData.angles && finalData.rssi) {
        const finalChartData = finalData.angles.map((angle, i) => ({
          angle: angle,
          rssi: finalData.rssi[i],
        }));

        if (finalChartData.length >= 3) {
          const result = performCurveFitting(finalChartData, 'gaussian');
          const r2Value = calculateR2(finalChartData, result.fittedCurve);

          // Notify parent component of best angle update
          if (onBestAngleUpdate && result.bestAngle.angle !== -1) {
            onBestAngleUpdate(boardId, result.bestAngle);
          }

          return {
            fittedCurve: result.fittedCurve || [],
            bestAngle: result.bestAngle,
            parameters: result.parameters,
            quality: { ...result.quality, r2: r2Value },
            isFinalAnalysis: true,
          };
        }
      }

      // During live tracking or insufficient data, just find simple source max point
      if (chartData.length > 0) {
        let sourceMaxPoint = { angle: -1, rssi: -999 };
        chartData.forEach((point) => {
          if (point.rssi > sourceMaxPoint.rssi) {
            sourceMaxPoint = { angle: point.angle, rssi: point.rssi };
          }
        });

        return {
          fittedCurve: [],
          bestAngle: sourceMaxPoint,
          parameters: null,
          quality: { error: 0, r2: 0 },
          isFinalAnalysis: false,
        };
      }

      // No data
      return {
        fittedCurve: [],
        bestAngle: { angle: -1, rssi: -999 },
        parameters: null,
        quality: { error: 0, r2: 0 },
        isFinalAnalysis: false,
      };
    }, [chartData, finalData, boardId, onBestAngleUpdate]);

  // Determine which data to display
  const displayData =
    finalData && finalData.angles && finalData.rssi
      ? finalData.angles.map((angle, i) => ({ angle, rssi: finalData.rssi[i] }))
      : chartData;

  // Chart title based on state
  const getChartTitle = () => {
    if (isTracking) {
      return 'Live RSSI Scanning';
    } else if (isFinalAnalysis) {
      return 'Final Results with Gaussian Fit';
    } else {
      return 'RSSI vs Angle';
    }
  };

  return (
    <div className="space-y-2">
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
              <span className="text-xs text-blue-400">Analysis Complete</span>
            </div>
          )}
        </div>
        <div className="text-sm text-purple-400">
          {isFinalAnalysis ? 'Peak:' : 'Source Max:'}{' '}
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
              wrapperStyle={{ zIndex: 1000 }}
              contentStyle={{
                backgroundColor: '#1f2937',
                color: '#ffffff',
                border: '1px solid #a78bfa',
                borderRadius: '6px',
                padding: '10px',
                fontSize: '13px',
                fontWeight: '500',
                boxShadow: '0 5px 15px rgba(139, 92, 246, 0.2)',
              }}
              itemStyle={{ color: '#ffffff' }}
              labelStyle={{
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '14px',
                marginBottom: '4px',
              }}
              formatter={(value, name) => {
                if (name === 'rssi' || name.includes('RSSI')) {
                  return [
                    `${value.toFixed(1)} dBm`,
                    isFinalAnalysis ? 'Measured Power' : 'Live Power',
                  ];
                }
                if (name === 'best' || name.includes('Peak')) {
                  return [`${value.toFixed(1)} dBm`, 'Predicted Peak Power'];
                }
                if (name.includes('Current')) {
                  return [`${value.toFixed(1)} dBm`, 'Source Max Power'];
                }
                return [`${value.toFixed(1)} dBm`, 'Gaussian Fit'];
              }}
              labelFormatter={(label) => `Angle: ${label}°`}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-gray-800 border border-purple-400 rounded-lg p-3 shadow-lg">
                      <div className="text-purple-200 font-semibold mb-2">
                        Angle: {label}°
                      </div>
                      {payload.map((entry, index) => {
                        const isPeak =
                          entry.name?.includes('Peak') ||
                          entry.name?.includes('best');
                        const isFit = entry.name?.includes('Fit');

                        return (
                          <div
                            key={index}
                            className="flex justify-between items-center mb-1"
                          >
                            <span className="text-purple-300">
                              {isPeak
                                ? 'Peak Power:'
                                : isFit
                                ? 'Fit Power:'
                                : 'Power:'}
                            </span>
                            <span className="text-white font-medium ml-2">
                              {entry.value?.toFixed(1)} dBm
                            </span>
                          </div>
                        );
                      })}
                      {isFinalAnalysis && (
                        <div className="text-xs text-purple-400 mt-2 pt-2 border-t border-purple-500/30">
                          Gaussian curve fitted
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend wrapperStyle={{ color: '#c4b5fd', fontSize: 12 }} />

            {/* Data points */}
            <Scatter
              name={isFinalAnalysis ? 'Final RSSI' : 'Live RSSI'}
              data={displayData}
              fill={boardId === 'board1' ? '#8b5cf6' : '#ec4899'}
              shape="circle"
              opacity={isFinalAnalysis ? 0.8 : 0.6}
              size={isFinalAnalysis ? 8 : 6}
            />

            {/* Gaussian fitted curve - only shown for final analysis */}
            {isFinalAnalysis && fittedCurve.length > 0 && (
              <Line
                name="Gaussian Fit"
                type="monotone"
                dataKey="rssi"
                data={fittedCurve}
                stroke={boardId === 'board1' ? '#3b82f6' : '#f97316'}
                strokeWidth={3}
                dot={false}
                connectNulls={false}
              />
            )}

            {/* Best angle marker */}
            {bestAngle.angle !== -1 && (
              <Scatter
                name={isFinalAnalysis ? 'Predicted Peak' : 'Source Max'}
                data={[bestAngle]}
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
                size={isFinalAnalysis ? 15 : 12}
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Status and basic info */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="space-y-1">
          <div className="text-purple-400">
            {isTracking
              ? 'Live Status:'
              : isFinalAnalysis
              ? 'Final Analysis:'
              : 'Data Status:'}
          </div>
          <div className="text-purple-300">Points: {displayData.length}</div>
          {isTracking && (
            <div className="text-green-300">Scanning in progress...</div>
          )}
          {isFinalAnalysis && (
            <div className="text-blue-300">R² = {quality.r2.toFixed(3)}</div>
          )}
        </div>
        {isFinalAnalysis && parameters && (
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
        {!isFinalAnalysis && bestAngle.angle !== -1 && (
          <div className="space-y-1">
            <div className="text-purple-400">Source Max:</div>
            <div className="text-purple-300">
              {bestAngle.rssi.toFixed(1)} dBm
            </div>
            <div className="text-purple-300">
              at {bestAngle.angle.toFixed(1)}°
            </div>
          </div>
        )}
      </div>

      {/* Detailed parameters (only for final analysis) */}
      {showDetails && isFinalAnalysis && parameters && (
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

      {/* Live tracking hint */}
      {isTracking && !isFinalAnalysis && (
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded p-2 text-xs">
          <div className="text-yellow-400 font-medium mb-1">
            Live Tracking Mode
          </div>
          <div className="text-yellow-300">
            Curve fitting will be performed automatically when scan completes.
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveChart;
