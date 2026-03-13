'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Zap, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface Model {
  id: number;
  filename: string;
  uploaded_at: string;
}

interface Dataset {
  id: number;
  filename: string;
  uploaded_at: string;
}

interface FeatureImportance {
  feature: string;
  importance: number;
  importance_percent: number;
}

interface TopFeature {
  feature: string;
  shap_value: number;
  feature_value: number;
}

interface SamplePrediction {
  id: number;
  prediction: number;
  confidence: number;
  top_features: TopFeature[];
}

interface ExplainabilityResult {
  model_name: string;
  dataset_name: string;
  shap_feature_importance: FeatureImportance[];
  model_feature_importance: FeatureImportance[] | null;
  sample_predictions: SamplePrediction[];
  interpretability_score: number;
  num_samples_analyzed: number;
  total_features: number;
}

export function ExplainabilityEngine() {
  const router = useRouter();
  const [models, setModels] = useState<Model[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [targetColumn, setTargetColumn] = useState<string>('');
  const [numSamples, setNumSamples] = useState<string>('100');
  const [result, setResult] = useState<ExplainabilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);

  const getToken = () => localStorage.getItem('access_token');

  useEffect(() => {
    fetchModels();
    fetchDatasets();
  }, []);

  const fetchModels = async () => {
    const token = getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const res = await fetch('http://localhost:8000/upload/models', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  };

  const fetchDatasets = async () => {
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch('http://localhost:8000/upload/datasets', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setDatasets(data.datasets || []);
      }
    } catch (err) {
      console.error('Failed to fetch datasets:', err);
    }
  };

  const analyzeExplainability = async () => {
    if (!selectedModel || !selectedDataset || !targetColumn) {
      setError('Please select model, dataset, and target column');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    const token = getToken();

    try {
      const res = await fetch('http://localhost:8000/explainability/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model_id: parseInt(selectedModel),
          dataset_id: parseInt(selectedDataset),
          target_column: targetColumn,
          num_samples: parseInt(numSamples)
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.available_columns) {
          setAvailableColumns(data.available_columns);
          setError(`${data.error}. Available columns: ${data.available_columns.join(', ')}`);
        } else {
          setError(data.error || 'Analysis failed');
        }
        return;
      }

      setResult(data);

    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getInterpretabilityColor = (score: number) => {
    if (score >= 8) return 'text-green-500';
    if (score >= 6) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getInterpretabilityLabel = (score: number) => {
    if (score >= 8) return 'Excellent';
    if (score >= 6) return 'Good';
    if (score >= 4) return 'Fair';
    return 'Poor';
  };

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold">Explainability Engine</h1>
        <p className="text-muted-foreground mt-2">SHAP values, feature importance, and model interpretability analysis</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Analysis Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Model Explanations</CardTitle>
          <CardDescription>Analyze SHAP values and feature importance for your model</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Select Model</label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map(model => (
                    <SelectItem key={model.id} value={model.id.toString()}>
                      {model.filename}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Select Dataset</label>
              <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a dataset" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map(dataset => (
                    <SelectItem key={dataset.id} value={dataset.id.toString()}>
                      {dataset.filename}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Target Column Name</label>
              <Input
                type="text"
                value={targetColumn}
                onChange={(e) => setTargetColumn(e.target.value)}
                placeholder="e.g., target, label, class"
              />
              {availableColumns.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Available: {availableColumns.join(', ')}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Number of Samples</label>
              <Input
                type="number"
                value={numSamples}
                onChange={(e) => setNumSamples(e.target.value)}
                placeholder="100"
                min="10"
                max="1000"
              />
              <p className="text-xs text-muted-foreground mt-1">
                More samples = more accurate but slower
              </p>
            </div>
          </div>

          <Button 
            onClick={analyzeExplainability} 
            disabled={loading || !selectedModel || !selectedDataset || !targetColumn}
            className="w-full"
          >
            {loading ? 'Analyzing... (This may take a minute)' : 'Analyze Model Explainability'}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Interpretability Score</p>
                <p className={`text-3xl font-bold mt-2 ${getInterpretabilityColor(result.interpretability_score)}`}>
                  {result.interpretability_score.toFixed(1)}/10
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {getInterpretabilityLabel(result.interpretability_score)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total Features</p>
                <p className="text-3xl font-bold mt-2">{result.total_features}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {result.num_samples_analyzed} samples analyzed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Top Feature Importance</p>
                <p className="text-3xl font-bold mt-2">
                  {result.shap_feature_importance[0]?.importance_percent.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {result.shap_feature_importance[0]?.feature}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* SHAP Feature Importance Chart */}
          <Card>
            <CardHeader>
              <CardTitle>SHAP Global Feature Importance</CardTitle>
              <CardDescription>Average impact of each feature on model predictions</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart 
                  data={result.shap_feature_importance}
                  layout="vertical"
                  margin={{ left: 150 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="feature" type="category" width={140} />
                  <Tooltip 
                    formatter={(value: number) => value.toFixed(4)}
                  />
                  <Bar dataKey="importance" fill="#6366f1" name="SHAP Importance" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Model Feature Importance (if available) */}
          {result.model_feature_importance && (
            <Card>
              <CardHeader>
                <CardTitle>Model Feature Importance</CardTitle>
                <CardDescription>Built-in feature importance from the model</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={result.model_feature_importance}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="feature" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `${(value * 100).toFixed(2)}%`} />
                    <Bar dataKey="importance" fill="#10b981" name="Importance" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Feature Impact Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Feature Impact Breakdown</CardTitle>
              <CardDescription>Relative importance of top features</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {result.shap_feature_importance.slice(0, 10).map((item, idx) => (
                  <div key={item.feature}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {idx + 1}. {item.feature}
                      </span>
                      <span className="text-sm font-bold text-blue-500">
                        {item.importance_percent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded h-2 overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${item.importance_percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Sample Predictions */}
          <Card>
            <CardHeader>
              <CardTitle>Sample Predictions & Explanations</CardTitle>
              <CardDescription>Individual predictions with top contributing features</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.sample_predictions.map((pred) => (
                <div
                  key={pred.id}
                  className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium">Prediction {pred.id}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-1 rounded text-xs font-bold bg-primary/20 text-primary">
                          Class: {pred.prediction}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Confidence: {(pred.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Top Contributing Features:</p>
                    <div className="space-y-2">
                      {pred.top_features.map((feature, idx) => (
                        <div key={feature.feature} className="flex items-center justify-between text-sm">
                          <span className="font-medium">
                            {idx + 1}. {feature.feature}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              Value: {feature.feature_value.toFixed(2)}
                            </span>
                            <span className={`font-bold ${feature.shap_value > 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {feature.shap_value > 0 ? <TrendingUp className="w-4 h-4 inline" /> : <TrendingDown className="w-4 h-4 inline" />}
                              {Math.abs(feature.shap_value).toFixed(3)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* Instructions */}
      {models.length === 0 || datasets.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Activity className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">Get Started</h3>
              <p className="text-muted-foreground mb-4">
                Upload a trained model (.pkl) and a dataset (.csv) to analyze model explainability
              </p>
              <Button onClick={() => window.location.href = '/'}>
                Upload Model & Dataset
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}