import React, { useState, useEffect, useRef } from 'react';

const TriangulationCalculator = ({
  systemData = {},
  boards = ['board1', 'board2'],
}) => {
  const [baselineDistance, setBaselineDistance] = useState(1);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [autoCalculate, setAutoCalculate] = useState(true);
  const canvasRef = useRef(null);

  // Get peak angles from system data with safety checks
  const getPeakAngles = () => {
    const angles = {};
    boards.forEach((boardId) => {
      const boardData = systemData[boardId];
      const peakAngle = boardData?.peakAngle;
      angles[boardId] = peakAngle && peakAngle !== -1 ? peakAngle : null;
    });
    return angles;
  };

  const peakAngles = getPeakAngles();

  // Auto-calculate when peak angles change
  useEffect(() => {
    if (
      autoCalculate &&
      peakAngles.board1 !== null &&
      peakAngles.board2 !== null
    ) {
      calculateTriangulation();
    }
  }, [peakAngles.board1, peakAngles.board2, baselineDistance, autoCalculate]);

  const triangulate = (d, angle1Deg, angle2Deg) => {
    const theta1 = (angle1Deg * Math.PI) / 180;
    const theta2 = Math.PI - (angle2Deg * Math.PI) / 180;

    const sin_diff = Math.sin(theta1 - theta2);
    if (Math.abs(sin_diff) < 1e-10) {
      return { error: 'Lines are parallel and do not intersect.' };
    }

    const sin1 = Math.sin(theta1);
    const cos1 = Math.cos(theta1);
    const sin2 = Math.sin(theta2);
    const cos2 = Math.cos(theta2);

    const t = (-d * sin2) / sin_diff;
    const s = (-d * sin1) / sin_diff;

    const distance1 = Math.abs(t);
    const distance2 = Math.abs(s);

    if (distance1 === 0 || distance2 === 0) {
      return { error: 'Source coincides with a receiver.' };
    }

    const sourceX = t * cos1;
    const sourceY = t * sin1;

    // Compute actual interior angles
    let angle1_actual = (180 / Math.PI) * Math.acos(sourceX / distance1);
    let angle2_actual = (180 / Math.PI) * Math.acos((d - sourceX) / distance2);

    const dot3 = -d * sourceX + distance1 * distance1;
    const cos3 = dot3 / (distance1 * distance2);
    let angle3_actual = (180 / Math.PI) * Math.acos(cos3);

    if (
      isNaN(angle1_actual) ||
      isNaN(angle2_actual) ||
      isNaN(angle3_actual) ||
      !isFinite(t) ||
      !isFinite(s)
    ) {
      return { error: 'Invalid configuration.' };
    }

    return {
      distance1: distance1,
      distance2: distance2,
      baseline: d,
      sourceX: sourceX,
      sourceY: sourceY,
      angle1: angle1_actual,
      angle2: angle2_actual,
      angle3: angle3_actual,
    };
  };

  const calculateTriangulation = () => {
    if (peakAngles.board1 === null || peakAngles.board2 === null) {
      setError('Both boards must have detected peak angles for triangulation.');
      setResults(null);
      return;
    }

    if (baselineDistance <= 0) {
      setError('Baseline distance must be greater than 0.');
      setResults(null);
      return;
    }

    const result = triangulate(
      baselineDistance,
      peakAngles.board1,
      peakAngles.board2
    );

    if (result.error) {
      setError(result.error);
      setResults(null);
      return;
    }

    setError(null);
    setResults(result);
    drawTriangle(result);
  };

  const drawTriangle = (result) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const d = baselineDistance;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Compute scale dynamically
    const absY = Math.abs(result.sourceY);
    const maxHorizontal = Math.max(
      Math.abs(result.sourceX),
      Math.abs(result.sourceX - d)
    );
    const viewWidth = Math.max(d, 2 * maxHorizontal);
    const viewHeight = 2 * absY;
    let scale = Math.min(
      (canvas.width * 0.8) / (viewWidth || 1),
      (canvas.height * 0.8) / (viewHeight || 1)
    );

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Calculate positions
    const receiver1X = centerX - (d * scale) / 2;
    const receiver1Y = centerY;
    const receiver2X = centerX + (d * scale) / 2;
    const receiver2Y = centerY;
    const sourceX_draw = receiver1X + result.sourceX * scale;
    const sourceY_draw = receiver1Y - result.sourceY * scale;

    // Draw grid
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }

    // Draw triangle
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(receiver1X, receiver1Y);
    ctx.lineTo(sourceX_draw, sourceY_draw);
    ctx.lineTo(receiver2X, receiver2Y);
    ctx.lineTo(receiver1X, receiver1Y);
    ctx.stroke();

    // Draw baseline
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(receiver1X, receiver1Y);
    ctx.lineTo(receiver2X, receiver2Y);
    ctx.stroke();

    // Draw angle arcs
    drawAngleArc(
      ctx,
      receiver1X,
      receiver1Y,
      sourceX_draw,
      sourceY_draw,
      receiver2X,
      receiver2Y,
      result.angle1,
      '#f97316',
      'right'
    );
    drawAngleArc(
      ctx,
      receiver2X,
      receiver2Y,
      sourceX_draw,
      sourceY_draw,
      receiver1X,
      receiver1Y,
      result.angle2,
      '#3b82f6',
      'left'
    );

    // Draw points
    drawPoint(ctx, receiver1X, receiver1Y, 'Board 1', '#10b981');
    drawPoint(ctx, receiver2X, receiver2Y, 'Board 2', '#10b981');
    drawPoint(ctx, sourceX_draw, sourceY_draw, 'Signal Source', '#ef4444');

    // Draw distance labels
    drawDistanceLabel(
      ctx,
      receiver1X,
      receiver1Y,
      sourceX_draw,
      sourceY_draw,
      result.distance1.toFixed(2) + 'm'
    );
    drawDistanceLabel(
      ctx,
      receiver2X,
      receiver2Y,
      sourceX_draw,
      sourceY_draw,
      result.distance2.toFixed(2) + 'm'
    );
    drawDistanceLabel(
      ctx,
      receiver1X,
      receiver1Y,
      receiver2X,
      receiver2Y,
      d.toFixed(2) + 'm'
    );
  };

  const drawPoint = (ctx, x, y, label, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - 15);
  };

  const drawDistanceLabel = (ctx, x1, y1, x2, y2, text) => {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    ctx.fillStyle = '#1f2937';
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.fillRect(midX - 25, midY - 10, 50, 20);
    ctx.strokeRect(midX - 25, midY - 10, 50, 20);

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(text, midX, midY + 4);
  };

  const drawAngleArc = (
    ctx,
    centerX,
    centerY,
    point1X,
    point1Y,
    point2X,
    point2Y,
    angle,
    color,
    side
  ) => {
    const radius = 40;

    const angle1 = Math.atan2(point1Y - centerY, point1X - centerX);
    const angle2 = Math.atan2(point2Y - centerY, point2X - centerX);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, angle2, angle1, side === 'left');
    ctx.stroke();

    const labelAngle = (angle1 + angle2) / 2;
    const labelX = centerX + Math.cos(labelAngle) * (radius + 15);
    const labelY = centerY + Math.sin(labelAngle) * (radius + 15);

    ctx.fillStyle = color;
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(angle.toFixed(1) + '°', labelX, labelY);
  };

  const canCalculate = peakAngles.board1 !== null && peakAngles.board2 !== null;

  return (
    <div className="bg-gray-800/80 rounded-xl p-6 shadow-lg border border-purple-500/30 backdrop-blur-sm">
      <h2 className="text-xl font-bold text-purple-300 mb-4 text-center border-b border-purple-500/50 pb-2">
        Triangulation Calculator
      </h2>

      <div className="mb-4 p-3 bg-blue-900/30 border border-blue-500/50 rounded-lg">
        <p className="text-blue-200 text-sm">
          <strong>How it works:</strong> Using peak angles detected by both
          boards to calculate the exact position and distance of the signal
          source.
        </p>
      </div>

      {/* Input Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Baseline Distance (m)
          </label>
          <input
            type="number"
            value={baselineDistance}
            onChange={(e) =>
              setBaselineDistance(parseFloat(e.target.value) || 0)
            }
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            step="0.1"
            min="0.1"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Board 1 Peak Angle
          </label>
          <div className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
            {peakAngles.board1 !== null
              ? `${peakAngles.board1.toFixed(1)}°`
              : 'No peak detected'}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Board 2 Peak Angle
          </label>
          <div className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
            {peakAngles.board2 !== null
              ? `${peakAngles.board2.toFixed(1)}°`
              : 'No peak detected'}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Controls
          </label>
          <div className="flex space-x-2">
            <button
              onClick={calculateTriangulation}
              disabled={!canCalculate}
              className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              Calculate
            </button>
            <button
              onClick={() => setAutoCalculate(!autoCalculate)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                autoCalculate
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : 'bg-gray-600 hover:bg-gray-700 text-white'
              }`}
            >
              Auto
            </button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex justify-center mb-6">
        <canvas
          ref={canvasRef}
          width="800"
          height="500"
          className="border-2 border-gray-600 rounded-lg bg-gray-900"
        />
      </div>

      {/* Results */}
      {error && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-500/50 rounded-lg">
          <p className="text-red-400">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}

      {results && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-4">
          <h3 className="text-green-400 font-semibold mb-4">
            Triangulation Results
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-gray-700/50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-green-400">
                {results.distance1.toFixed(2)} m
              </div>
              <div className="text-sm text-gray-300 mt-1">
                Distance from Board 1
              </div>
            </div>

            <div className="bg-gray-700/50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-green-400">
                {results.distance2.toFixed(2)} m
              </div>
              <div className="text-sm text-gray-300 mt-1">
                Distance from Board 2
              </div>
            </div>

            <div className="bg-gray-700/50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-green-400">
                {results.baseline.toFixed(2)} m
              </div>
              <div className="text-sm text-gray-300 mt-1">
                Baseline Distance
              </div>
            </div>

            <div className="bg-gray-700/50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-green-400">
                {results.angle3.toFixed(1)}°
              </div>
              <div className="text-sm text-gray-300 mt-1">Angle at Source</div>
            </div>

            <div className="bg-gray-700/50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-green-400">
                ({results.sourceX.toFixed(2)}, {results.sourceY.toFixed(2)})
              </div>
              <div className="text-sm text-gray-300 mt-1">
                Source Coordinates
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TriangulationCalculator;
