from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
import xgboost as xgb
from io import BytesIO
import base64
import os
from dotenv import load_dotenv
import seaborn as sns
import requests

# Configuration
load_dotenv()
MONGO_URI = os.getenv("MONGODB_URI")
DB_NAME = 'steam_data'
COLLECTION_NAME = 'games'

app = Flask(__name__)
CORS(app)


def get_embedding(text):
    """Obtient l'embedding d'un texte via le service d'embedding"""
    try:
        response = requests.post(
            'http://localhost:5000/embed',
            json={'text': text},
            timeout=10
        )
        if response.ok:
            data = response.json()
            return data.get('embedding')
        return None
    except Exception as e:
        print(f"Erreur lors de l'obtention de l'embedding: {e}")
        return None


def get_games_data(search_query=None):
    """Récupère les données des jeux depuis MongoDB, avec option de recherche vectorielle"""
    try:
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        
        # Si une recherche est spécifiée, utiliser la recherche vectorielle
        if search_query:
            print(f"Recherche vectorielle pour: {search_query}")
            query_embedding = get_embedding(search_query)
            
            if query_embedding:
                # Recherche vectorielle
                games = list(collection.aggregate([
                    {
                        '$vectorSearch': {
                            'queryVector': query_embedding,
                            'path': 'combined_embedding',
                            'index': 'vector_index',
                            'limit': 500,  # Limiter à 500 jeux les plus pertinents
                            'numCandidates': 1000
                        }
                    },
                    {
                        '$project': {
                            '_id': 1,
                            'name': 1,
                            'developer': 1,
                            'positive': 1,
                            'negative': 1,
                            'owners': 1,
                            'average_playtime': 1,
                            'median_playtime': 1,
                            'price': 1,
                            'score': {'$meta': 'vectorSearchScore'}
                        }
                    }
                ]))
                print(f"Recherche vectorielle: {len(games)} jeux trouvés")
            else:
                # Fallback sur recherche par nom
                print("Fallback sur recherche par nom")
                games = list(collection.find(
                    {'name': {'$regex': search_query, '$options': 'i'}},
                    {
                        '_id': 1,
                        'name': 1,
                        'developer': 1,
                        'positive': 1,
                        'negative': 1,
                        'owners': 1,
                        'average_playtime': 1,
                        'median_playtime': 1,
                        'price': 1
                    }
                ).limit(500))
        else:
            # Récupérer tous les jeux (limité à 1000 pour les performances)
            games = list(collection.find({}, {
                '_id': 1,
                'name': 1,
                'developer': 1,
                'positive': 1,
                'negative': 1,
                'owners': 1,
                'average_playtime': 1,
                'median_playtime': 1,
                'price': 1
            }).limit(1000))
        
        client.close()
        return games
    except Exception as e:
        print(f"Erreur lors de la récupération des données: {e}")
        return None


## Algorithme 1: Random Forest pour classifier les jeux par développeur
def classify_valve_games(search_query=None):
    """
    Algorithme 1: Random Forest pour classifier les jeux par développeur
    """
    try:
        games = get_games_data(search_query)
        if not games:
            return None, "Erreur lors de la récupération des données"
        
        if len(games) < 10:
            return None, "Pas assez de jeux dans les résultats (minimum 10 requis)"
        
        # Préparer le DataFrame
        df = pd.DataFrame(games)
        
        # Nettoyer les données
        df['positive'] = pd.to_numeric(df['positive'], errors='coerce').fillna(0)
        df['negative'] = pd.to_numeric(df['negative'], errors='coerce').fillna(0)
        df['total_reviews'] = df['positive'] + df['negative']
        df['review_ratio'] = df.apply(
            lambda x: x['positive'] / x['total_reviews'] if x['total_reviews'] > 0 else 0, 
            axis=1
        )
        
        # Nettoyer les développeurs
        df['developer'] = df['developer'].fillna('Unknown')
        df['developer'] = df['developer'].apply(lambda x: str(x).strip() if isinstance(x, str) else 'Unknown')
        
        # Identifier les développeurs principaux (ceux avec au moins 3 jeux)
        developer_counts = df['developer'].value_counts()
        top_developers = developer_counts[developer_counts >= 3].head(10)  # Top 10 développeurs
        
        if len(top_developers) == 0:
            return None, "Aucun développeur avec suffisamment de jeux pour la classification"
        
        # Filtrer pour ne garder que les jeux des développeurs principaux
        df_filtered = df[df['developer'].isin(top_developers.index)].copy()
        
        if len(df_filtered) < 10:
            return None, f"Pas assez de jeux des développeurs principaux (trouvé: {len(df_filtered)})"
        
        # Créer un encodage numérique pour les développeurs
        from sklearn.preprocessing import LabelEncoder
        le = LabelEncoder()
        df_filtered['developer_encoded'] = le.fit_transform(df_filtered['developer'])
        
        # Sélectionner les features
        features = ['positive', 'negative', 'total_reviews', 'review_ratio']
        X = df_filtered[features].fillna(0)
        y = df_filtered['developer_encoded']
        
        # Split des données
        try:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.3, random_state=42, stratify=y
            )
        except ValueError:
            # Si stratify échoue, split simple
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.3, random_state=42
            )
        
        # Entraîner le modèle Random Forest
        rf_model = RandomForestClassifier(
            n_estimators=100, 
            max_depth=15, 
            random_state=42,
            class_weight='balanced'
        )
        rf_model.fit(X_train, y_train)
        
        # Prédictions
        y_pred = rf_model.predict(X_test)
        
        # Métriques
        accuracy = rf_model.score(X_test, y_test)
        
        # Prédire pour tous les jeux
        df_filtered['developer_prediction'] = rf_model.predict(X)
        df_filtered['predicted_developer'] = le.inverse_transform(df_filtered['developer_prediction'])
        
        # Statistiques par développeur
        developer_stats = df_filtered.groupby('developer').agg({
            'name': 'count',
            'positive': 'mean',
            'negative': 'mean',
            'total_reviews': 'mean',
            'review_ratio': 'mean'
        }).round(2)
        developer_stats.columns = ['Nombre de jeux', 'Avis positifs (moy)', 'Avis négatifs (moy)', 'Total avis (moy)', 'Ratio positif (moy)']
        developer_stats = developer_stats.sort_values('Nombre de jeux', ascending=False)
        
        # Visualisations
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        
        # 1. Distribution des jeux par développeur
        dev_counts = developer_stats['Nombre de jeux'].head(10)
        axes[0].bar(range(len(dev_counts)), dev_counts.values, color='lightgreen', edgecolor='black')
        axes[0].set_xticks(range(len(dev_counts)))
        axes[0].set_xticklabels([d[:15] + '...' if len(d) > 15 else d for d in dev_counts.index], rotation=45, ha='right')
        axes[0].set_ylabel('Nombre de jeux')
        axes[0].set_title('Top 10 Développeurs par Nombre de Jeux')
        axes[0].grid(axis='y', alpha=0.3)
        
        # 2. Précision du modèle
        axes[1].text(0.5, 0.6, f'Précision globale', ha='center', fontsize=14, weight='bold')
        axes[1].text(0.5, 0.4, f'{accuracy*100:.1f}%', ha='center', fontsize=48, color='green')
        axes[1].text(0.5, 0.2, f'{len(top_developers)} développeurs classifiés', ha='center', fontsize=12)
        axes[1].axis('off')
        axes[1].set_title('Performance du Modèle')
        
        plt.tight_layout()
        
        # Sauvegarder le graphique
        buffer = BytesIO()
        plt.savefig(buffer, format='png', bbox_inches='tight', dpi=100)
        plt.close()
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        buffer.close()
        
        # Sélectionner des jeux représentatifs de chaque développeur
        games_by_developer = []
        for dev in top_developers.head(5).index:
            dev_games = df_filtered[df_filtered['developer'] == dev].nlargest(3, 'total_reviews')[
                ['name', 'developer', 'positive', 'negative']
            ]
            games_by_developer.extend(dev_games.to_dict('records'))
        
        result = {
            'model': 'Random Forest - Classification par Développeur',
            'accuracy': float(accuracy),
            'developers_found': len(top_developers),
            'total_games': len(df_filtered),
            'total_games_all': len(df),
            'top_developers': top_developers.to_dict(),
            'developer_stats': developer_stats.to_dict(),
            'games_by_developer': games_by_developer,
            'image_base64': image_base64
        }
        
        return result, None
        
    except Exception as e:
        print(f"Erreur dans classify_valve_games: {e}")
        import traceback
        traceback.print_exc()
        return None, f"Erreur lors de la classification: {str(e)}"


## Algorithme 2: XGBoost pour prédire un score de pertinence
def predict_relevance_score(search_query=None):
    """
    Algorithme 2: XGBoost pour prédire un score de pertinence basé sur les variables
    """
    games = get_games_data(search_query)
    if not games:
        return None, "Erreur lors de la récupération des données"
    
    # Préparer le DataFrame
    df = pd.DataFrame(games)
    
    # Nettoyer les données
    df['positive'] = pd.to_numeric(df['positive'], errors='coerce').fillna(0)
    df['negative'] = pd.to_numeric(df['negative'], errors='coerce').fillna(0)
    df['total_reviews'] = df['positive'] + df['negative']
    
    # Créer un score de pertinence (0-100) basé sur les avis positifs
    # Score = (positive / total_reviews) * 100 avec un poids pour le nombre total d'avis
    df['relevance_score'] = df.apply(
        lambda x: (x['positive'] / x['total_reviews'] * 100 * np.log1p(x['total_reviews']) / 10) 
        if x['total_reviews'] > 0 else 0,
        axis=1
    )
    df['relevance_score'] = df['relevance_score'].clip(0, 100)
    
    # Filtrer les jeux avec au moins quelques avis
    df = df[df['total_reviews'] >= 10].copy()
    
    if len(df) < 50:
        return None, "Pas assez de données pour entraîner le modèle"
    
    # Features
    features = ['positive', 'negative', 'total_reviews']
    X = df[features]
    y = df['relevance_score']
    
    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42
    )
    
    # Entraîner XGBoost
    xgb_model = xgb.XGBRegressor(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.1,
        random_state=42
    )
    xgb_model.fit(X_train, y_train)
    
    # Prédictions
    y_pred = xgb_model.predict(X_test)
    
    # Métriques
    from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error
    r2 = r2_score(y_test, y_pred)
    mse = mean_squared_error(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)
    
    # Prédire pour tous les jeux
    df['predicted_score'] = xgb_model.predict(X)
    top_games = df.nlargest(20, 'predicted_score')[['name', 'developer', 'positive', 'negative', 'predicted_score']]
    
    # Visualisation
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    
    # 1. Réel vs Prédit
    axes[0].scatter(y_test, y_pred, alpha=0.5, color='steelblue', edgecolors='black', linewidth=0.5)
    axes[0].plot([y_test.min(), y_test.max()], [y_test.min(), y_test.max()], 'r--', lw=2)
    axes[0].set_xlabel('Score Réel')
    axes[0].set_ylabel('Score Prédit')
    axes[0].set_title(f'Prédiction vs Réalité (R² = {r2:.3f})')
    axes[0].grid(alpha=0.3)
    
    # 2. Distribution des scores prédits
    axes[1].hist(df['predicted_score'], bins=30, edgecolor='black', alpha=0.7, color='skyblue')
    axes[1].set_xlabel('Score de Pertinence Prédit')
    axes[1].set_ylabel('Nombre de Jeux')
    axes[1].set_title('Distribution des Scores de Pertinence')
    axes[1].grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    
    # Sauvegarder
    buffer = BytesIO()
    plt.savefig(buffer, format='png', bbox_inches='tight', dpi=100)
    plt.close()
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    buffer.close()
    
    result = {
        'model': 'XGBoost Regression',
        'r2_score': float(r2),
        'mse': float(mse),
        'mae': float(mae),
        'top_games': top_games.to_dict('records'),
        'image_base64': image_base64
    }
    
    return result, None


## Algorithme 3: K-Means pour regrouper les jeux par thématique
def cluster_games_kmeans(search_query=None):
    """
    Algorithme 3: K-Means pour regrouper les jeux par thématique
    et trouver le cluster contenant la même thématique
    """
    games = get_games_data(search_query)
    if not games:
        return None, "Erreur lors de la récupération des données"
    
    # Préparer le DataFrame
    df = pd.DataFrame(games)
    
    # Nettoyer les données
    df['positive'] = pd.to_numeric(df['positive'], errors='coerce').fillna(0)
    df['negative'] = pd.to_numeric(df['negative'], errors='coerce').fillna(0)
    df['total_reviews'] = df['positive'] + df['negative']
    df['review_ratio'] = df.apply(
        lambda x: x['positive'] / x['total_reviews'] if x['total_reviews'] > 0 else 0,
        axis=1
    )
    
    # Filtrer les jeux avec des données suffisantes
    df = df[df['total_reviews'] >= 10].copy()
    
    if len(df) < 50:
        return None, "Pas assez de données pour le clustering"
    
    # Features pour le clustering
    features = ['positive', 'negative', 'total_reviews', 'review_ratio']
    X = df[features].fillna(0)
    
    # Normalisation
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Déterminer le nombre optimal de clusters avec la méthode du coude
    inertias = []
    K_range = range(2, min(11, len(df) // 10))
    for k in K_range:
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        kmeans.fit(X_scaled)
        inertias.append(kmeans.inertia_)
    
    # Utiliser 5 clusters par défaut
    n_clusters = 5
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    df['cluster'] = kmeans.fit_predict(X_scaled)
    
    # Trouver le jeu de référence (le premier dans les résultats)
    reference_game = df.iloc[0]
    reference_cluster = reference_game['cluster']
    reference_name = reference_game['name']
    
    # Obtenir les jeux du même cluster que le jeu de référence
    cluster_games = df[df['cluster'] == reference_cluster][['name', 'developer', 'positive', 'negative', 'cluster']].head(20)
    
    # Statistiques par cluster
    cluster_stats = df.groupby('cluster').agg({
        'positive': 'mean',
        'negative': 'mean',
        'total_reviews': 'mean',
        'review_ratio': 'mean',
        'name': 'count'
    }).round(2)
    cluster_stats.columns = ['Positive Moyen', 'Negative Moyen', 'Total Reviews Moyen', 'Ratio Positif Moyen', 'Nombre de Jeux']
    
    # Visualisations
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    
    # 1. Scatter plot des clusters (Positive vs Negative)
    scatter = axes[0].scatter(
        df['positive'], 
        df['negative'], 
        c=df['cluster'], 
        cmap='viridis', 
        alpha=0.6,
        s=50,
        edgecolors='black',
        linewidth=0.5
    )
    # Marquer le jeu de référence
    axes[0].scatter(
        reference_game['positive'], 
        reference_game['negative'], 
        c='red', 
        s=300, 
        marker='*', 
        edgecolors='black',
        linewidth=2,
        label=f'Référence: {reference_name[:25]}...' if len(reference_name) > 25 else f'Référence: {reference_name}',
        zorder=5
    )
    axes[0].legend(loc='upper right')
    axes[0].set_xlabel('Avis Positifs')
    axes[0].set_ylabel('Avis Négatifs')
    axes[0].set_title('Clustering K-Means des Jeux')
    axes[0].set_xlim(0, df['positive'].quantile(0.95) * 1.1)
    axes[0].set_ylim(0, df['negative'].quantile(0.95) * 1.1)
    axes[0].grid(alpha=0.3)
    plt.colorbar(scatter, ax=axes[0], label='Cluster')
    
    # 2. Distribution des jeux par cluster
    cluster_counts = df['cluster'].value_counts().sort_index()
    bars = axes[1].bar(cluster_counts.index, cluster_counts.values, color='skyblue', edgecolor='black')
    # Mettre en évidence le cluster de référence
    bars[reference_cluster].set_color('coral')
    axes[1].set_xlabel('Cluster')
    axes[1].set_ylabel('Nombre de Jeux')
    axes[1].set_title('Distribution des Jeux par Cluster')
    axes[1].set_xticks(range(n_clusters))
    axes[1].grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    
    # Sauvegarder
    buffer = BytesIO()
    plt.savefig(buffer, format='png', bbox_inches='tight', dpi=100)
    plt.close()
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    buffer.close()
    
    result = {
        'model': 'K-Means Clustering',
        'n_clusters': n_clusters,
        'reference_game': reference_name,
        'reference_cluster': int(reference_cluster),
        'cluster_stats': cluster_stats.to_dict(),
        'cluster_games': cluster_games.to_dict('records'),
        'total_games_analyzed': len(df),
        'image_base64': image_base64
    }
    
    return result, None


# Routes API
@app.route('/ml/random-forest', methods=['GET'])
def api_random_forest():
    """Route pour la classification Random Forest (Jeux Valve)"""
    search_query = request.args.get('search', None)
    result, error = classify_valve_games(search_query)
    if error:
        return jsonify({'error': error}), 500
    return jsonify(result), 200


@app.route('/ml/xgboost', methods=['GET'])
def api_xgboost():
    """Route pour la prédiction XGBoost (Score de pertinence)"""
    search_query = request.args.get('search', None)
    result, error = predict_relevance_score(search_query)
    if error:
        return jsonify({'error': error}), 500
    return jsonify(result), 200


@app.route('/ml/kmeans', methods=['GET'])
def api_kmeans():
    """Route pour le clustering K-Means"""
    search_query = request.args.get('search', None)
    result, error = cluster_games_kmeans(search_query)
    if error:
        return jsonify({'error': error}), 500
    return jsonify(result), 200


@app.route('/ml/all', methods=['GET'])
def api_all_models():
    """Route pour exécuter tous les modèles ML"""
    search_query = request.args.get('search', None)
    results = {}
    
    if search_query:
        results['search_query'] = search_query
    
    # Random Forest
    rf_result, rf_error = classify_valve_games(search_query)
    if rf_error:
        results['random_forest'] = {'error': rf_error}
    else:
        results['random_forest'] = rf_result
    
    # XGBoost
    xgb_result, xgb_error = predict_relevance_score(search_query)
    if xgb_error:
        results['xgboost'] = {'error': xgb_error}
    else:
        results['xgboost'] = xgb_result
    
    # K-Means
    kmeans_result, kmeans_error = cluster_games_kmeans(search_query)
    if kmeans_error:
        results['kmeans'] = {'error': kmeans_error}
    else:
        results['kmeans'] = kmeans_result
    
    return jsonify(results), 200


if __name__ == '__main__':
    print("=" * 60)
    print("Service de Classification ML pour l'analyse des jeux Steam")
    print("=" * 60)
    print("\nModèles disponibles:")
    print("  1. Random Forest - Classification des jeux Valve")
    print("  2. XGBoost - Prédiction du score de pertinence")
    print("  3. K-Means - Clustering thématique des jeux")
    print("\nEndpoints API:")
    print("  GET /ml/random-forest - Random Forest")
    print("  GET /ml/xgboost - XGBoost")
    print("  GET /ml/kmeans - K-Means")
    print("  GET /ml/all - Tous les modèles")
    print("\nDémarrage du service sur http://localhost:5002")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5002, debug=True)
