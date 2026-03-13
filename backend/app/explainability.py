from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import pandas as pd
import numpy as np
import pickle
from sklearn.inspection import permutation_importance
from models import get_db
import os
from datetime import datetime

explainability_bp = Blueprint("explainability", __name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_model(model_path):
    """Load a pickled model"""
    try:
        with open(model_path, 'rb') as f:
            return pickle.load(f)
    except:
        import joblib
        return joblib.load(model_path)

@explainability_bp.route("/analyze", methods=["POST"])
@jwt_required()
def analyze_explainability():
    """Generate feature importance using Permutation Importance"""
    user_id = get_jwt_identity()
    data = request.json
    
    model_id = data.get('model_id')
    dataset_id = data.get('dataset_id')
    target_column = data.get('target_column')
    num_samples = int(data.get('num_samples', 100))
    
    if not model_id or not dataset_id or not target_column:
        return jsonify({"error": "model_id, dataset_id, and target_column required"}), 400
    
    conn = get_db()
    cur = conn.cursor()
    
    try:
        # Get model
        cur.execute(
            "SELECT filename, path FROM uploaded_models WHERE id = %s AND user_id = %s",
            (model_id, user_id)
        )
        model_result = cur.fetchone()
        
        # Get dataset
        cur.execute(
            "SELECT filename, path FROM uploaded_datasets WHERE id = %s AND user_id = %s",
            (dataset_id, user_id)
        )
        dataset_result = cur.fetchone()
        
        if not model_result or not dataset_result:
            return jsonify({"error": "Model or dataset not found"}), 404
        
        print(f"Loading model: {model_result[0]}")
        model = load_model(model_result[1])
        
        print(f"Loading dataset: {dataset_result[0]}")
        df = pd.read_csv(dataset_result[1])
        
        if target_column not in df.columns:
            return jsonify({
                "error": f"Target column '{target_column}' not found",
                "available_columns": df.columns.tolist()
            }), 400
        
        # Prepare data
        X = df.drop(columns=[target_column])
        y = df[target_column]
        
        print(f"Dataset: {X.shape[0]} rows, {X.shape[1]} features")
        print(f"Features: {X.columns.tolist()}")
        
        # Sample data
        if len(X) > num_samples:
            indices = np.random.choice(len(X), num_samples, replace=False)
            X_sample = X.iloc[indices]
            y_sample = y.iloc[indices]
        else:
            X_sample = X
            y_sample = y
        
        # ============= PERMUTATION IMPORTANCE =============
        print("Calculating Permutation Importance...")
        
        try:
            perm_importance = permutation_importance(
                model, X_sample, y_sample,
                n_repeats=10,
                random_state=42,
                n_jobs=-1
            )
            
            # Build feature importance list
            feature_importance = []
            for i, feature in enumerate(X.columns):
                importance = float(perm_importance.importances_mean[i])
                feature_importance.append({
                    'feature': feature,
                    'importance': max(0, importance),  # No negative importance
                    'importance_std': float(perm_importance.importances_std[i]),
                    'importance_percent': 0
                })
            
            # Sort and calculate percentages
            feature_importance.sort(key=lambda x: x['importance'], reverse=True)
            total_importance = sum(f['importance'] for f in feature_importance) or 1.0
            
            for f in feature_importance:
                f['importance_percent'] = (f['importance'] / total_importance * 100)
            
            print(f"✅ Permutation importance calculated for {len(feature_importance)} features")
            
        except Exception as e:
            print(f"Permutation importance failed: {e}")
            # Fallback: use model's built-in importance if available
            feature_importance = []
            
            if hasattr(model, 'feature_importances_'):
                for i, feature in enumerate(X.columns):
                    feature_importance.append({
                        'feature': feature,
                        'importance': float(model.feature_importances_[i]),
                        'importance_std': 0.0,
                        'importance_percent': float(model.feature_importances_[i] * 100)
                    })
                feature_importance.sort(key=lambda x: x['importance'], reverse=True)
            else:
                # Last resort: equal importance
                equal_imp = 1.0 / len(X.columns)
                for feature in X.columns:
                    feature_importance.append({
                        'feature': feature,
                        'importance': equal_imp,
                        'importance_std': 0.0,
                        'importance_percent': equal_imp * 100
                    })
        
        # ============= MODEL FEATURE IMPORTANCE =============
        model_importance = []
        if hasattr(model, 'feature_importances_'):
            for i, feature in enumerate(X.columns):
                model_importance.append({
                    'feature': feature,
                    'importance': float(model.feature_importances_[i]),
                    'importance_percent': float(model.feature_importances_[i] * 100)
                })
            model_importance.sort(key=lambda x: x['importance'], reverse=True)
        
        # ============= SAMPLE PREDICTIONS =============
        sample_predictions = []
        num_pred_samples = min(5, len(X_sample))
        
        for idx in range(num_pred_samples):
            sample_x = X_sample.iloc[idx:idx+1]
            
            if hasattr(model, 'predict_proba'):
                pred_proba = model.predict_proba(sample_x)[0]
                prediction = int(np.argmax(pred_proba))
                confidence = float(pred_proba[prediction])
            else:
                prediction = int(model.predict(sample_x)[0])
                confidence = 1.0
            
            # Get top 3 important features for this sample
            top_features_global = feature_importance[:3]
            
            top_features = []
            for feat_info in top_features_global:
                feat_name = feat_info['feature']
                feat_idx = X.columns.get_loc(feat_name)
                top_features.append({
                    'feature': feat_name,
                    'shap_value': feat_info['importance'],  # Use importance as proxy
                    'feature_value': float(sample_x.iloc[0, feat_idx])
                })
            
            sample_predictions.append({
                'id': idx + 1,
                'prediction': prediction,
                'confidence': confidence,
                'top_features': top_features
            })
        
        # ============= INTERPRETABILITY SCORE =============
        top_5_importance = sum(f['importance_percent'] for f in feature_importance[:5])
        interpretability_score = min(10, (top_5_importance / 10))
        
        # ============= SAVE TO DATABASE =============
        cur.execute(
            """
            INSERT INTO explainability_logs 
            (model_name, dataset_name, num_features, interpretability_score, user_id, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (model_result[0], dataset_result[0], len(X.columns), interpretability_score, user_id, datetime.now())
        )
        conn.commit()
        
        print(f"✅ Analysis complete!")
        
        return jsonify({
            "success": True,
            "model_name": model_result[0],
            "dataset_name": dataset_result[0],
            "explainer_type": "Permutation Importance",
            "shap_feature_importance": feature_importance[:10],
            "model_feature_importance": model_importance[:10] if model_importance else None,
            "sample_predictions": sample_predictions,
            "interpretability_score": float(interpretability_score),
            "num_samples_analyzed": len(X_sample),
            "total_features": len(X.columns)
        })
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
        import traceback
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()


@explainability_bp.route("/history", methods=["GET"])
@jwt_required()
def get_explainability_history():
    """Get explainability analysis history"""
    user_id = get_jwt_identity()
    
    conn = get_db()
    cur = conn.cursor()
    
    try:
        cur.execute(
            """
            SELECT model_name, dataset_name, num_features, interpretability_score, created_at
            FROM explainability_logs
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT 20
            """,
            (user_id,)
        )
        
        logs = cur.fetchall()
        
        history = []
        for model_name, dataset_name, num_features, interp_score, created_at in logs:
            history.append({
                'model_name': model_name,
                'dataset_name': dataset_name,
                'num_features': num_features,
                'interpretability_score': float(interp_score),
                'timestamp': created_at.isoformat()
            })
        
        return jsonify({
            "success": True,
            "history": history
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()