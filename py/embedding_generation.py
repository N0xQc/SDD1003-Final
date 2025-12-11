import os
from dotenv import load_dotenv
from pymongo import MongoClient
import pymongo
from sentence_transformers import SentenceTransformer

# Charger les variables d'environnement
load_dotenv()
MONGO_URI = os.getenv("MONGODB_URI") 
DB_NAME = 'steam_data'
COLLECTION_NAME = 'games'
EMBEDDING_FIELD = 'combined_embedding' # Nouveau champ pour stocker les embeddings dans MongoDB
FIELDS_TO_EMBED = ['name', 'developer'] # Champs à utiliser pour générer les embeddings

# Modèle de génération d'embeddings
MODEL_NAME = "all-MiniLM-L6-v2"

def generate_embeddings():
    """
    Connecte à MongoDB, charge le modèle, et génère/met à jour 
    les embeddings pour chaque document sans embedding.
    """
    # Charger le modèle d'embeddings
    print("Chargement du modèle d'embeddings...")
    try:
        model = SentenceTransformer(MODEL_NAME)
        embedding_dimension = model.get_sentence_embedding_dimension()
        print(f"Modèle chargé avec une dimension d'embedding de {embedding_dimension}.")
    except Exception as e:
        print(f"Erreur lors du chargement du modèle: {e}")
        return
    
    # Connexion à MongoDB
    print("Connexion à MongoDB Atlas...")
    try:
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        print("Connexion à MongoDB réussie.")
    except Exception as e:
        print(f"Erreur lors de la connexion à MongoDB: {e}")
        return
    
    # Trouver les documents sans embeddings
    query = {
        EMBEDDING_FIELD: {"$exists": False}, 
        'name': {'$exists': True, '$ne': ''}, # Assurer que le champ 'name' existe et n'est pas vide
        'developer': {'$exists': True, '$ne': ''} # Assurer que le champ 'developer' existe et n'est pas vide
    }
    projection = {field: 1 for field in FIELDS_TO_EMBED}
    documents_to_update = list(collection.find(query, projection))
    if not documents_to_update:
        print("Tous les documents ont déjà des embeddings.")
        client.close()
        return
    
    # Générer les embeddings pour les documents trouvés
    print(f"{len(documents_to_update)} documents trouvés sans embeddings. Génération des embeddings...")
    texts_to_embed = []
    for doc in documents_to_update:
        combined_text = ' '.join(str(doc.get(field, '')) for field in FIELDS_TO_EMBED)
        texts_to_embed.append(combined_text)
    embeddings = model.encode(texts_to_embed, show_progress_bar=True)

    # Mettre à jour les documents avec les nouveaux embeddings dans MongoDB
    print("Mise à jour des documents avec les nouveaux embeddings...")
    update_count = 0
    batch_size = 1000  # Taille du lot pour les mises à jour en masse (pour éviter les timeouts)
    
    for i in range(0, len(documents_to_update), batch_size):
        batch_docs = documents_to_update[i:i + batch_size]
        batch_embeddings = embeddings[i:i + batch_size]
        
        updates = []
        for doc, embedding in zip(batch_docs, batch_embeddings):
            update_doc = {
                '$set': {
                    EMBEDDING_FIELD: embedding.tolist()  # Convertir le tableau numpy en liste pour MongoDB
                }
            }
            updates.append(
                pymongo.UpdateOne(
                    {'_id': doc['_id']}, 
                    update_doc
                )
            )
        
        if updates:
            try:
                collection.bulk_write(updates)
                update_count += len(updates)
                print(f"Batch {i//batch_size + 1}: {update_count}/{len(documents_to_update)} documents mis à jour")
            except Exception as e:
                print(f"Erreur lors de la mise à jour du batch {i//batch_size + 1}: {e}")
    
    print(f"Mise à jour terminée. {update_count} documents mis à jour avec des embeddings.")

    # Fermer la connexion à MongoDB
    client.close()
    print("Connexion à MongoDB fermée.")
    print("Processus terminé.")

if __name__ == "__main__":
    import pymongo
    generate_embeddings()