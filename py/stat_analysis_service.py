from pymongo import MongoClient
import numpy as np
import matplotlib
matplotlib.use('Agg') 
import matplotlib.pyplot as plt
from scipy.stats import norm
from io import BytesIO
import base64
import os
from dotenv import load_dotenv

# Configuration
load_dotenv()
MONGO_URI = os.getenv("MONGODB_URI")
DB_NAME = 'steam_data'
COLLECTION_NAME = 'games'
VARIABLE_TO_ANALYZE = 'positive'

# Calculer les statistiques
def calculate_n_plot_statistics():
    """
    Connecte à MongoDB, récupère les données pour la variable spécifiée,
    calcule les statistiques et génère un graphique de distribution.
    Retourne les statistiques et le graphique encodé en base64.
    """
    try:
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]

        pipeline = [
            {'$match': { VARIABLE_TO_ANALYZE: {'$type': 'number', '$gte': 0}}},
            {'$project': {'_id': 0, 'value': f'${VARIABLE_TO_ANALYZE}'}}
        ]
        data = [doc['value'] for doc in collection.aggregate(pipeline)]
        if not data:
            return None, "Aucune donnée disponible pour l'analyse."
        
        client.close()
    except Exception as e:
        return None, f"Erreur lors de la connexion à MongoDB ou récupération des données: {e}"
    
    # Convertir les données en numpy array
    x = np.array(data)
    x.sort()
    n = len(x)

    # Calculer l'EDF empirique
    y_edf = np.arange(1, n + 1) / n

    # Calculer la CDF théorique (normale)
    mu, std = x.mean(), x.std()
    y_cdf = norm.cdf(x, loc=mu, scale=std)

    # Générer le graphique
    plt.figure(figsize=(10, 6))
    plt.plot(x, y_edf, marker='.', linestyle='none', label='EDF (Empirique)', markersize=4, alpha=0.7)
    plt.plot(x, y_cdf, color='red', label='CDF (Normale)', linestyle='-', linewidth=2)
    plt.title(f'Fonctions de Distribution Empirique vs Théorique pour "{VARIABLE_TO_ANALYZE}"')
    plt.xlabel(VARIABLE_TO_ANALYZE)
    plt.ylabel('Probabilité Cumultative')
    plt.legend()
    plt.grid(True, linestyle='--', alpha=0.6)

    # Sauvegarder le graphique dans un buffer
    buffer = BytesIO()
    plt.savefig(buffer, format='png', bbox_inches='tight')
    plt.close()
    buffer.seek(0)

    # Encoder le graphique en base64
    image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    buffer.close()

    # Calculer les statistiques descriptives
    stats = {
        'mean': float(mu),
        'median': float(np.median(x)),
        'std_dev': float(std),
        'min': float(x.min()),
        'max': float(x.max()),
        'count': int(n)
    }

    return image_base64, stats, None

# Flask API
from flask import Flask, jsonify
app = Flask(__name__)

@app.route('/statistics', methods=['GET'])
def get_statistics():
    """
    Route API qui retourne les statistiques et le graphique de distribution
    pour la variable spécifiée.
    """
    image_base64, stats, error = calculate_n_plot_statistics()

    if error:
        return jsonify({'error': error}), 500
    
    return jsonify({
        'stats': stats,
        'image_base64': image_base64,
        'variable': VARIABLE_TO_ANALYZE
    }), 200

print(f"Module name: {__name__}")
if __name__ == '__main__':
    print("Démarrage du service d'analyse statistique sur http://localhost:5001")
    app.run(host='localhost', port=5001, debug=True)