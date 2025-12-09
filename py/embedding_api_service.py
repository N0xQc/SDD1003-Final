#embedding_api_service.py
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
import sys

app = Flask(__name__)
MODEL_NAME = "all-MiniLM-L6-v2"

try:
    print("Chargement du modèle d'embeddings...")
    model = SentenceTransformer(MODEL_NAME)
    print("Modèle chargé avec succès.")
except Exception as e:
    print(f"Erreur lors du chargement du modèle: {e}")
    sys.exit(1)

@app.route('/embed', methods=['POST'])
def embed_text():
    """
    Route API qui prend un texte en entrée et retourne son vecteur d'embedding.
    """
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'Aucun texte fourni.'}), 400
    text_to_embed = data['text']

    try:
        embedding = model.encode(text_to_embed)

        return jsonify({
            'embedding': embedding.tolist(),
            'dimension': len(embedding)
        }), 200
    
    except Exception as e:
        print(f"Erreur lors de la génération de l'embedding: {e}")
        return jsonify({'error': f'Erreur lors de la génération de l\'embedding: {e}'}), 500
    
if __name__ == '__main__':
    print("Démarrage du service d'API d'embeddings sur http://localhost:5000")
    app.run(host='0.0.0.0', port=5000)