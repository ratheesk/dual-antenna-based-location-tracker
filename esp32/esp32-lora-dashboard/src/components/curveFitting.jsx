// Method 1: Polynomial Regression (Recommended for RSSI data)
function polynomialFit(data, degree = 3) {
  const n = data.length;
  if (n === 0) return { coefficients: [], fittedCurve: [] };

  // Create matrix A and vector b for normal equations
  const A = [];
  const b = [];

  for (let i = 0; i < n; i++) {
    const x = data[i].angle;
    const y = data[i].rssi;
    const row = [];

    for (let j = 0; j <= degree; j++) {
      row.push(Math.pow(x, j));
    }
    A.push(row);
    b.push(y);
  }

  // Solve using normal equations (A^T * A * x = A^T * b)
  const AT = transpose(A);
  const ATA = multiply(AT, A);
  const ATb = multiplyVector(AT, b);

  const coefficients = gaussianElimination(ATA, ATb);

  // Generate fitted curve
  const fittedCurve = [];
  for (let angle = 0; angle <= 180; angle += 2) {
    let rssi = 0;
    for (let j = 0; j <= degree; j++) {
      rssi += coefficients[j] * Math.pow(angle, j);
    }
    fittedCurve.push({ angle, rssi });
  }

  return { coefficients, fittedCurve };
}

// Enhanced Gaussian/Bell Curve Fitting (Optimized for RSSI data)
function gaussianFit(data) {
  if (data.length < 3)
    return {
      fittedCurve: [],
      parameters: null,
      bestAngle: { angle: -1, rssi: 0 },
    };

  // Sort data by angle for better processing
  const sortedData = [...data].sort((a, b) => a.angle - b.angle);

  // Initial parameter estimates with better heuristics
  const maxPoint = sortedData.reduce((max, point) =>
    point.rssi > max.rssi ? point : max
  );
  const minRssi = Math.min(...sortedData.map((p) => p.rssi));
  const maxRssi = Math.max(...sortedData.map((p) => p.rssi));

  let amplitude = maxRssi - minRssi;
  let center = maxPoint.angle;
  let baseline = minRssi;

  // Estimate sigma based on data spread at half maximum
  const halfMax = baseline + amplitude / 2;
  const halfMaxPoints = sortedData.filter((p) => p.rssi >= halfMax);
  let sigma =
    halfMaxPoints.length > 0
      ? (Math.max(...halfMaxPoints.map((p) => p.angle)) -
          Math.min(...halfMaxPoints.map((p) => p.angle))) /
        2.35
      : 20; // Default fallback

  // Adaptive step size for better convergence
  let stepSize = 0.1;
  let prevError = Infinity;

  // Levenberg-Marquardt style optimization
  for (let iter = 0; iter < 200; iter++) {
    const gradient = calculateGaussianGradient(
      sortedData,
      amplitude,
      center,
      sigma,
      baseline
    );
    const currentError = calculateGaussianError(
      sortedData,
      amplitude,
      center,
      sigma,
      baseline
    );

    // Adaptive step size
    if (currentError < prevError) {
      stepSize *= 1.1; // Increase step size if improving
    } else {
      stepSize *= 0.5; // Decrease step size if getting worse
    }
    stepSize = Math.max(0.001, Math.min(0.5, stepSize)); // Clamp step size

    // Update parameters
    amplitude -= gradient.dA * stepSize;
    center -= gradient.dC * stepSize;
    sigma -= gradient.dS * stepSize;
    baseline -= gradient.dB * stepSize;

    // Apply constraints with soft boundaries
    amplitude = Math.max(1, Math.min(100, amplitude)); // Reasonable RSSI range
    center = Math.max(0, Math.min(180, center));
    sigma = Math.max(2, Math.min(80, sigma)); // Reasonable beam widths
    baseline = Math.max(minRssi - 5, Math.min(maxRssi, baseline));

    // Check for convergence
    if (Math.abs(currentError - prevError) < 0.001) {
      break;
    }
    prevError = currentError;
  }

  // Generate smooth fitted curve
  const fittedCurve = [];
  for (let angle = 0; angle <= 180; angle += 1) {
    const rssi =
      baseline +
      amplitude * Math.exp(-Math.pow(angle - center, 2) / (2 * sigma * sigma));
    fittedCurve.push({ angle, rssi });
  }

  // Calculate confidence metrics
  const beamWidth = 2.35 * sigma; // FWHM (Full Width at Half Maximum)
  const peakRssi = baseline + amplitude;

  return {
    fittedCurve,
    parameters: {
      amplitude: amplitude.toFixed(2),
      center: center.toFixed(1),
      sigma: sigma.toFixed(1),
      baseline: baseline.toFixed(1),
      beamWidth: beamWidth.toFixed(1),
      peakRssi: peakRssi.toFixed(1),
    },
    bestAngle: { angle: center, rssi: peakRssi },
    quality: {
      error: calculateGaussianError(
        sortedData,
        amplitude,
        center,
        sigma,
        baseline
      ),
      r2: 0, // Will be calculated separately
    },
  };
}

// Calculate mean squared error for Gaussian fit
function calculateGaussianError(data, A, C, S, B) {
  let totalError = 0;
  for (const point of data) {
    const predicted =
      B + A * Math.exp(-Math.pow(point.angle - C, 2) / (2 * S * S));
    const error = predicted - point.rssi;
    totalError += error * error;
  }
  return totalError / data.length;
}

// Method 3: Cosine-based Fitting (Physics-based for RF patterns)
function cosineFit(data) {
  if (data.length < 3) return { fittedCurve: [], parameters: null };

  // Fit to: RSSI = A * cos²(θ - θ₀) + B
  const maxPoint = data.reduce((max, point) =>
    point.rssi > max.rssi ? point : max
  );

  let amplitude = maxPoint.rssi - Math.min(...data.map((p) => p.rssi));
  let phaseShift = (maxPoint.angle * Math.PI) / 180; // Convert to radians
  let baseline = Math.min(...data.map((p) => p.rssi));

  // Simple gradient descent
  for (let iter = 0; iter < 100; iter++) {
    let dA = 0,
      dP = 0,
      dB = 0;
    let error = 0;

    for (const point of data) {
      const theta = (point.angle * Math.PI) / 180;
      const predicted =
        amplitude * Math.pow(Math.cos(theta - phaseShift), 2) + baseline;
      const diff = predicted - point.rssi;

      error += diff * diff;

      // Gradients
      dA += diff * Math.pow(Math.cos(theta - phaseShift), 2);
      dP +=
        diff *
        amplitude *
        2 *
        Math.cos(theta - phaseShift) *
        Math.sin(theta - phaseShift);
      dB += diff;
    }

    const stepSize = 0.001;
    amplitude -= dA * stepSize;
    phaseShift -= dP * stepSize;
    baseline -= dB * stepSize;

    // Constraints
    amplitude = Math.max(0, amplitude);
    phaseShift = Math.max(0, Math.min(Math.PI, phaseShift));
  }

  // Generate fitted curve
  const fittedCurve = [];
  for (let angle = 0; angle <= 180; angle += 2) {
    const theta = (angle * Math.PI) / 180;
    const rssi =
      amplitude * Math.pow(Math.cos(theta - phaseShift), 2) + baseline;
    fittedCurve.push({ angle, rssi });
  }

  const bestAngle = (phaseShift * 180) / Math.PI;
  return {
    fittedCurve,
    parameters: { amplitude, phaseShift: bestAngle, baseline },
    bestAngle: { angle: bestAngle, rssi: amplitude + baseline },
  };
}

// Method 4: Using a mathematical library (if available)
function advancedCurveFit(data, method = 'polynomial') {
  // If you can import a math library like ml-regression or simple-statistics:
  //
  // import { PolynomialRegression } from 'ml-regression-polynomial';
  //
  // const x = data.map(d => d.angle);
  // const y = data.map(d => d.rssi);
  // const regression = new PolynomialRegression(x, y, 3);
  //
  // const fittedCurve = [];
  // for (let angle = 0; angle <= 180; angle += 2) {
  //   fittedCurve.push({ angle, rssi: regression.predict(angle) });
  // }
  //
  // return { fittedCurve, r2: regression.r2 };
}

// Helper functions for polynomial fitting
function transpose(matrix) {
  return matrix[0].map((_, colIndex) => matrix.map((row) => row[colIndex]));
}

function multiply(a, b) {
  const result = [];
  for (let i = 0; i < a.length; i++) {
    result[i] = [];
    for (let j = 0; j < b[0].length; j++) {
      let sum = 0;
      for (let k = 0; k < b.length; k++) {
        sum += a[i][k] * b[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function multiplyVector(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, val, idx) => sum + val * vector[idx], 0)
  );
}

function gaussianElimination(A, b) {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);

  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    // Eliminate column
    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= augmented[i][j] * x[j];
    }
    x[i] /= augmented[i][i];
  }

  return x;
}

function calculateGaussianGradient(data, A, C, S, B) {
  let dA = 0,
    dC = 0,
    dS = 0,
    dB = 0;

  for (const point of data) {
    const x = point.angle;
    const y = point.rssi;
    const predicted = B + A * Math.exp(-Math.pow(x - C, 2) / (2 * S * S));
    const error = predicted - y;
    const expTerm = Math.exp(-Math.pow(x - C, 2) / (2 * S * S));

    dA += error * expTerm;
    dC += (error * A * expTerm * (x - C)) / (S * S);
    dS += (error * A * expTerm * Math.pow(x - C, 2)) / (S * S * S);
    dB += error;
  }

  return { dA, dC, dS, dB };
}

// Usage example - focused on Gaussian fitting:
export function performCurveFitting(data, method = 'gaussian') {
  if (method === 'gaussian' || !method) {
    return gaussianFit(data);
  }
  // Fallback to polynomial if needed
  return polynomialFit(data, 3);
}

// Calculate R² (coefficient of determination) for goodness of fit
export function calculateR2(originalData, fittedCurve) {
  if (originalData.length === 0) return 0;

  const actualMean =
    originalData.reduce((sum, point) => sum + point.rssi, 0) /
    originalData.length;

  let totalSumSquares = 0;
  let residualSumSquares = 0;

  for (const point of originalData) {
    // Find closest fitted point
    const closest = fittedCurve.reduce((prev, curr) =>
      Math.abs(curr.angle - point.angle) < Math.abs(prev.angle - point.angle)
        ? curr
        : prev
    );

    totalSumSquares += Math.pow(point.rssi - actualMean, 2);
    residualSumSquares += Math.pow(point.rssi - closest.rssi, 2);
  }

  return 1 - residualSumSquares / totalSumSquares;
}
