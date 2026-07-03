export interface AutoPrognosisInput {
  headers: string[];
  rows: (string | number | null)[][];
  outcomeColumn: string;
  outcomeType: "binary" | "continuous" | "survival";
  testSize?: number;
  maxPredictors?: number;
  randomSeed?: number;
}

export interface AutoPrognosisResult {
  selectedPredictors: string[];
  auc: number;
  trainAuc: number;
  overfittingDetected: boolean;
  coefficients: Record<string, number>;
  intercept: number;
  pigTable: PigRow[];
  confusionMatrix: {
    tp: number;
    fp: number;
    tn: number;
    fn: number;
  };
  iterations: number;
}

export interface PigRow {
  predictor: string;
  coefficient: number;
  oddsRatio: number;
  ciLower: number;
  ciUpper: number;
  importance: number;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
}

function matMul(X: number[][], w: number[]): number[] {
  return X.map((row) => row.reduce((sum, xi, i) => sum + xi * w[i], 0));
}

export function trainTestSplitIndices(n: number, testSize: number, randomSeed: number): { train: number[]; test: number[] } {
  const indices = Array.from({ length: n }, (_, i) => i);
  let seed = randomSeed;
  const rand = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const splitIdx = Math.floor(n * (1 - testSize));
  return {
    train: indices.slice(0, splitIdx),
    test: indices.slice(splitIdx),
  };
}

export function computeAuc(labels: number[], probs: number[]): number {
  const pairs = labels.map((label, i) => ({ label, prob: probs[i] })).sort((a, b) => b.prob - a.prob);
  const nPos = labels.reduce((s, l) => s + (l === 1 ? 1 : 0), 0);
  const nNeg = labels.length - nPos;
  if (nPos === 0 || nNeg === 0) return 0.5;

  let tp = 0;
  let fp = 0;
  let auc = 0;
  let prevProb = NaN;

  for (const { label, prob } of pairs) {
    if (label === 1) tp++;
    else fp++;
    if (prob !== prevProb) {
      auc += fp * tp;
      prevProb = prob;
    }
  }

  return auc / (nPos * nNeg);
}

export function trainLogisticRegression(
  X: number[][],
  y: number[],
  lr = 0.1,
  epochs = 200,
  l2 = 0.01
): { weights: number[]; intercept: number } {
  const n = X.length;
  const d = X[0].length;
  let w = new Array(d).fill(0);
  let b = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const preds = X.map((row) => sigmoid(row.reduce((sum, xi, i) => sum + xi * w[i], 0) + b));
    const errors = preds.map((p, i) => p - y[i]);

    for (let j = 0; j < d; j++) {
      const grad = errors.reduce((sum, e, i) => sum + e * X[i][j], 0) / n + l2 * w[j];
      w[j] -= lr * grad;
    }
    const gradB = errors.reduce((sum, e) => sum + e, 0) / n;
    b -= lr * gradB;
  }

  return { weights: w, intercept: b };
}

export function predictProba(X: number[][], weights: number[], intercept: number): number[] {
  return X.map((row) => sigmoid(row.reduce((sum, xi, i) => sum + xi * weights[i], 0) + intercept));
}

export function forwardStepwiseSelection(
  XAll: number[][],
  y: number[],
  candidateNames: string[],
  maxPredictors: number,
  minAucImprovement = 0.01
): { selected: string[]; weights: number[]; intercept: number; auc: number; trainAuc: number; coefficients: Record<string, number> } {
  const n = XAll.length;
  const d = XAll[0].length;
  const selectedIndices: number[] = [];
  const remaining = Array.from({ length: d }, (_, i) => i);
  let bestWeights: number[] = [];
  let bestIntercept = 0;
  let bestAuc = 0;

  while (selectedIndices.length < maxPredictors && remaining.length > 0) {
    let bestCandidateIdx = -1;
    let bestCandidateAuc = bestAuc;

    for (const candIdx of remaining) {
      const trialIndices = [...selectedIndices, candIdx];
      const XSub = XAll.map((row) => trialIndices.map((i) => row[i]));
      if (trialIndices.length === 1) {
        const mean = XSub.map((r) => r[0]).reduce((a, b) => a + b, 0) / n;
        const centered = XSub.map((r) => [r[0] - mean]);
        const { weights, intercept } = trainLogisticRegression(centered, y);
        const probs = predictProba(centered, weights, intercept);
        const auc = computeAuc(y, probs);
        if (auc > bestCandidateAuc + minAucImprovement) {
          bestCandidateAuc = auc;
          bestCandidateIdx = candIdx;
          bestWeights = weights;
          bestIntercept = intercept - weights[0] * mean;
        }
      } else {
        const { weights, intercept } = trainLogisticRegression(XSub, y);
        const probs = predictProba(XSub, weights, intercept);
        const auc = computeAuc(y, probs);
        if (auc > bestCandidateAuc + minAucImprovement) {
          bestCandidateAuc = auc;
          bestCandidateIdx = candIdx;
          bestWeights = weights;
          bestIntercept = intercept;
        }
      }
    }

    if (bestCandidateIdx === -1) break;

    selectedIndices.push(bestCandidateIdx);
    remaining.splice(remaining.indexOf(bestCandidateIdx), 1);
    bestAuc = bestCandidateAuc;
  }

  const selectedNames = selectedIndices.map((i) => candidateNames[i]);
  const XFinal = XAll.map((row) => selectedIndices.map((i) => row[i]));
  const finalModel = selectedIndices.length > 0 ? trainLogisticRegression(XFinal, y) : { weights: [], intercept: 0 };
  const finalProbs = predictProba(XFinal, finalModel.weights, finalModel.intercept);
  const finalAuc = computeAuc(y, finalProbs);

  const coefficients: Record<string, number> = {};
  selectedIndices.forEach((idx, i) => {
    coefficients[candidateNames[idx]] = finalModel.weights[i];
  });

  return {
    selected: selectedNames,
    weights: finalModel.weights,
    intercept: finalModel.intercept,
    auc: finalAuc,
    trainAuc: finalAuc,
    coefficients,
  };
}

export function buildConfusionMatrix(labels: number[], probs: number[], threshold = 0.5) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < labels.length; i++) {
    const pred = probs[i] >= threshold ? 1 : 0;
    if (pred === 1 && labels[i] === 1) tp++;
    else if (pred === 1 && labels[i] === 0) fp++;
    else if (pred === 0 && labels[i] === 0) tn++;
    else fn++;
  }
  return { tp, fp, tn, fn };
}

export function buildPigTable(
  selectedNames: string[],
  weights: number[],
  intercept: number,
  X: number[][],
  y: number[]
): PigRow[] {
  return selectedNames.map((name, i) => {
    const coef = weights[i];
    const oddsRatio = Math.exp(coef);
    const se = Math.sqrt(1 / y.filter((label) => label === 1).length + 1 / y.filter((label) => label === 0).length);
    const ciLower = Math.exp(coef - 1.96 * se);
    const ciUpper = Math.exp(coef + 1.96 * se);

    const colIdx = selectedNames.indexOf(name);
    const importance = Math.abs(coef);

    return {
      predictor: name,
      coefficient: Number(coef.toFixed(4)),
      oddsRatio: Number(oddsRatio.toFixed(4)),
      ciLower: Number(ciLower.toFixed(4)),
      ciUpper: Number(ciUpper.toFixed(4)),
      importance: Number(importance.toFixed(4)),
    };
  });
}

export function runAutoPrognosis(input: AutoPrognosisInput): AutoPrognosisResult {
  const outcomeIdx = input.headers.indexOf(input.outcomeColumn);
  if (outcomeIdx === -1) throw new Error(`Outcome column "${input.outcomeColumn}" not found`);

  const cleanRows = input.rows
    .map((row) => row.map((val) => (typeof val === "number" ? val : parseFloat(String(val)))))
    .filter((row) => row.every((val) => !isNaN(val)));

  if (cleanRows.length === 0) throw new Error("No valid numeric rows found");

  const y = cleanRows.map((row) => row[outcomeIdx]);
  const numericHeaders = input.headers.map((h, idx) => ({ header: h, idx })).filter(
    ({ idx }) => idx !== outcomeIdx && cleanRows.every((row) => !isNaN(row[idx]))
  );
  const candidateNames = numericHeaders.map((h) => h.header);
  const XAll = cleanRows.map((row) => numericHeaders.map((h) => row[h.idx]));

  const maxPredictors = input.maxPredictors || Math.min(10, candidateNames.length);
  const testSize = input.testSize ?? 0.3;
  const randomSeed = input.randomSeed ?? 42;

  const { train, test } = trainTestSplitIndices(cleanRows.length, testSize, randomSeed);
  const XTrain = train.map((i) => XAll[i]);
  const yTrain = train.map((i) => y[i]);
  const XTest = test.map((i) => XAll[i]);
  const yTest = test.map((i) => y[i]);

  const fss = forwardStepwiseSelection(XTrain, yTrain, candidateNames, maxPredictors);
  const testProbabilities = predictProba(XTest.map((row) => fss.selected.map((name) => row[candidateNames.indexOf(name)])), fss.weights, fss.intercept);
  const testAuc = computeAuc(yTest, testProbabilities);
  const trainProbabilities = predictProba(XTrain.map((row) => fss.selected.map((name) => row[candidateNames.indexOf(name)])), fss.weights, fss.intercept);
  const trainAuc = computeAuc(yTrain, trainProbabilities);

  const pigTable = buildPigTable(fss.selected, fss.weights, fss.intercept, XTrain, yTrain);
  const confusion = buildConfusionMatrix(yTest, testProbabilities);

  return {
    selectedPredictors: fss.selected,
    auc: Number(testAuc.toFixed(4)),
    trainAuc: Number(trainAuc.toFixed(4)),
    overfittingDetected: trainAuc - testAuc > 0.05,
    coefficients: fss.coefficients,
    intercept: Number(fss.intercept.toFixed(4)),
    pigTable,
    confusionMatrix: confusion,
    iterations: 200,
  };
}
