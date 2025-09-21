import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const LiveChart = ({ boardId, chartData }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-purple-300">Live RSSI Chart</h3>
      <div className="h-80 bg-gray-900/50 rounded-xl p-4 border border-purple-500/30">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData[boardId]}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#6b46c1"
              opacity={0.3}
            />
            <XAxis
              dataKey="angle"
              label={{
                value: 'Angle (degrees)',
                position: 'insideBottom',
                offset: -10,
                style: { fill: '#c4b5fd' },
              }}
              stroke="#c4b5fd"
              tick={{ fill: '#c4b5fd' }}
            />
            <YAxis
              label={{
                value: 'RSSI (dBm)',
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#c4b5fd' },
              }}
              stroke="#c4b5fd"
              tick={{ fill: '#c4b5fd' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                color: '#e5e7eb',
                border: '1px solid #8b5cf6',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(139, 92, 246, 0.3)',
              }}
              formatter={(value) => [`${value} dBm`, 'RSSI']}
              labelFormatter={(label) => `Angle: ${label}°`}
              labelStyle={{ color: '#c4b5fd' }}
            />
            <Legend wrapperStyle={{ color: '#c4b5fd' }} />
            <Line
              type="monotone"
              dataKey="rssi"
              stroke={boardId === 'board1' ? '#8b5cf6' : '#ec4899'}
              strokeWidth={3}
              dot={{
                fill: boardId === 'board1' ? '#8b5cf6' : '#ec4899',
                strokeWidth: 2,
                r: 4,
              }}
              activeDot={{
                r: 6,
                stroke: boardId === 'board1' ? '#8b5cf6' : '#ec4899',
                strokeWidth: 2,
                fill: boardId === 'board1' ? '#a78bfa' : '#f472b6',
              }}
              name="RSSI (dBm)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default LiveChart;
