// data.js (Code de navigateur/Front-end)

// 1. [ AFFICHAGE ]
// Définir la fonction pour récupérer les données (global scope)
const fetchGames = async () => {
    try {
        // Appelle l'endpoint API Node.js/Express
        const response = await fetch('http://localhost:3000/games'); 
        // ... (reste du code fetchGames) ...
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }

        const games = await response.json(); 
        console.log('Données récupérées:', games); 

        populateTable(games);

    } catch (error) {
        console.error('Erreur lors de la récupération des jeux:', error);
        const tableBody = document.getElementById('tableBody');
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Erreur de connexion a l'API ( serveur Node.js non demarre ou CORS ).</td></tr>`;
    }
};

// Définir la fonction pour remplir la table (global scope)
const populateTable = (games) => {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = ''; 

    if (games.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Aucun jeu trouve dans la base de donnees.</td></tr>`;
        return;
    }

    // Trier les jeux par avis positifs (du plus élevé au plus bas)
    const sortedGames = [...games].sort((a, b) => {
        const aPositive = a.positive || 0;
        const bPositive = b.positive || 0;
        return bPositive - aPositive;
    });

    sortedGames.forEach((game, index) => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${index + 1}</td> 
            <td>${game.name || 'N/A'}</td>
            <td>${game.developer || 'N/A'}</td>
            <td>${game.positive || 0}</td>
            <td>${game.negative || 0}</td>
            <td><button class="crud-btn edit-btn" data-id="${game._id}"><i class="fa-solid fa-pen"></i></button></td>
            <td><button class="crud-btn delete-btn" data-id="${game._id}"><i class="fa-solid fa-trash"></i></button></td>
        `;
        
        tableBody.appendChild(row);
    });
};

document.addEventListener('DOMContentLoaded', () => {
    // Lancer la récupération des données au chargement de la page
    fetchGames();
});



// 2. [ RECHERCHE ]
// Recherche simple (GET)
async function searchGames(query) {
    try {
        const response = await fetch(`http://localhost:3000/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }
        const results = await response.json();
        return results;
    } catch (error) {
        console.error('Erreur lors de la recherche:', error);
        return [];
    }
}
// Recherche Vectorielle (GET)
async function vectorSearchGames(query) {
    try {
        const response = await fetch(`http://localhost:3000/vector-search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }

        const results = await response.json();
        return results;
    } catch (error) {
        console.error('Erreur lors de la recherche vectorielle:', error);
        return [];
    }
}

// Gérer le mode de recherche (simple vs vectorielle)
const searchModeToggle = document.getElementById('modeToggle');
const searchBar = document.getElementById('searchBar');
const generateClassificationBtn = document.getElementById('classificationGeneration');
searchModeToggle.addEventListener('change', () => {
    const isVectorSearch = searchModeToggle.checked;
    const searchInput = document.getElementById('searchInput');
    if (isVectorSearch) {
        searchBar.style.width = 'calc(100% - 150px)';
        generateClassificationBtn.style.visibility = 'visible';
        searchInput.setAttribute('data-search-mode', 'vector');
        searchInput.placeholder = 'Recherche vectorielle...';
    } else {
        searchBar.style.width = 'calc(100% - 100px)';
        generateClassificationBtn.style.visibility = 'collapse';
        searchInput.setAttribute('data-search-mode', 'simple');
        searchInput.placeholder = 'Recherche simple...';
    }
});

// Gérer le clic sur le bouton de génération de classification ML
generateClassificationBtn.addEventListener('click', async () => {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim();
    
    if (!query) {
        alert('Veuillez entrer une requête de recherche avant de générer les classifications.');
        return;
    }
    
    // Afficher le container ML
    dataContainer.style.display = 'none';
    viewCreate.style.display = 'none';
    viewHome.style.display = 'block';
    createContainer.style.display = 'none';
    editContainer.style.display = 'none';
    statisticsContainer.style.display = 'none';
    mlContainer.style.display = 'flex';
    
    // Afficher le chargement
    showMLLoading();
    document.getElementById('mlResults').innerHTML = `
        <div class="ml-info">
            <h3>🔍 Analyse basée sur la recherche: "${query}"</h3>
            <p>Recherche vectorielle en cours et génération des classifications ML...</p>
        </div>
    `;
    
    try {
        // D'abord effectuer la recherche vectorielle
        const searchResults = await vectorSearchGames(query);
        
        if (searchResults.length === 0) {
            hideMLLoading();
            document.getElementById('mlResults').innerHTML = `
                <div class="ml-error">
                    <i class="fa-solid fa-exclamation-triangle"></i>
                    Aucun jeu trouvé pour la requête "${query}". 
                    Essayez avec un autre terme de recherche.
                </div>
            `;
            return;
        }
        
        // Afficher les résultats de la recherche
        document.getElementById('mlResults').innerHTML = `
            <div class="ml-info">
                <h3>🔍 Recherche: "${query}"</h3>
                <p>${searchResults.length} jeu(x) trouvé(s). Génération des classifications ML...</p>
            </div>
        `;
        
        // Maintenant exécuter tous les modèles ML avec la requête de recherche
        await fetchAllMLModels(query);
        
    } catch (error) {
        hideMLLoading();
        console.error('Erreur lors de la génération des classifications:', error);
        document.getElementById('mlResults').innerHTML = `
            <div class="ml-error">
                <i class="fa-solid fa-exclamation-triangle"></i>
                Erreur lors de la génération des classifications ML pour "${query}".
                Vérifiez que les services sont démarrés.
            </div>
        `;
    }
});

// Remplir la table avec le résultat de la recherche
const populateTableSearch = (game) => {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>1</td>
        <td>${game.name || 'N/A'}</td>
        <td>${game.developer || 'N/A'}</td>
        <td>${game.positive || 0}</td>
        <td>${game.negative || 0}</td>
        <td><button class="crud-btn edit-btn" data-id="${game._id}"><i class="fa-solid fa-pen"></i></button></td>
        <td><button class="crud-btn delete-btn" data-id="${game._id}"><i class="fa-solid fa-trash"></i></button></td>`;
    tableBody.appendChild(row);
};

// Gérer l'autocomplétion et la recherche en temps réel
document.getElementById('searchInput').addEventListener('input', async (event) => {
    const query = event.target.value;
    if (query.length < 2) {
        document.getElementById('autocompleteList').style.visibility = 'collapse';
        return;
    }
    const searchMode = event.target.getAttribute('data-search-mode') || 'simple';
    if (searchMode === 'vector') {
        var results = await vectorSearchGames(query);
    } else {
        var results = await searchGames(query);
    }
    const autocompleteList = document.getElementById('autocompleteList');
    autocompleteList.style.visibility = results.length > 0 ? 'visible' : 'collapse';
    autocompleteList.innerHTML = '';
    results.forEach(game => {
        const item = document.createElement('a');
        
        item.textContent = game.name;
        autocompleteList.appendChild(item);
        item.addEventListener('click', (e) => {
            e.preventDefault();
            autocompleteList.style.visibility = 'collapse';
            document.getElementById('searchInput').value = '';
            populateTableSearch(game);
        });
    });
});



// 3. [ CRUD ]
// Changements de vue (Accueil, Création, édition)
const viewCreate = document.getElementById('viewCreate');
const createContainer = document.getElementById('creationContainer');
const viewHome = document.getElementById('viewHome');
const dataContainer = document.getElementById('homeContainer');
const editContainer = document.getElementById('editingContainer');
const editGameName = document.getElementById('editGameName');
const editGameDeveloper = document.getElementById('editGameDeveloper');
const editGamePositive = document.getElementById('editGamePositive');
const editGameNegative = document.getElementById('editGameNegative');
const viewStatistics = document.getElementById('viewStatistics');
const statisticsContainer = document.getElementById('statisticsContainer');
const viewML = document.getElementById('viewML');
const mlContainer = document.getElementById('mlContainer');

// Gérer les clics sur les boutons éditer et Supprimer
document.getElementById('tableBody').addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-btn');
    const deleteBtn = e.target.closest('.delete-btn');
    
    if (editBtn) {
        e.preventDefault();
        const gameId = editBtn.getAttribute('data-id');
        console.log('Edit game:', gameId);
        
        // Show edit container
        dataContainer.style.display = 'none';
        viewCreate.style.display = 'none';
        viewHome.style.display = 'block';
        createContainer.style.display = 'none';
        editContainer.style.display = 'flex';

        // Garder l'ID du jeu à éditer dans un attribut de données du formulaire
        editForm.setAttribute('data-game-id', gameId);

        // Charger les données du jeu à éditer
        fetch(`http://localhost:3000/search/${gameId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erreur HTTP! Statut: ${response.status}`);
                }
                return response.json();
            }
            ).then(game => {
                editGameName.value = game.name || '';
                editGameDeveloper.value = game.developer || '';
                editGamePositive.value = game.positive || 0;
                editGameNegative.value = game.negative || 0;
            })
            .catch(error => {
                console.error('Erreur lors de la récupération des données du jeu pour l\'édition:', error);
            });
    }
    
    if (deleteBtn) {
        e.preventDefault();
        const gameId = deleteBtn.getAttribute('data-id');
        console.log('Supprimer le jeu:', gameId);
        
        // Confirmer la suppression
        if (confirm('Êtes-vous sûr de vouloir supprimer ce jeu?')) {
            deleteGame(gameId);
        }
    }
});

// Supprimer un jeu (DELETE)
async function deleteGame(gameId) {
    try {
        const response = await fetch(`http://localhost:3000/games/${gameId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }
        
        // Rafraîchir la liste des jeux après la suppression
        location.reload();
    } catch (error) {
        console.error('Erreur de suppression:', error);
    }
}

// Gérer les changements de vue
viewCreate.addEventListener('click', () => {
    dataContainer.style.display = 'none';
    viewCreate.style.display = 'none';
    viewHome.style.display = 'block';
    createContainer.style.display = 'flex';
    editContainer.style.display = 'none';
    statisticsContainer.style.display = 'none';
    mlContainer.style.display = 'none';
});
viewHome.addEventListener('click', () => {
    dataContainer.style.display = 'flex';
    viewCreate.style.display = 'block';
    viewHome.style.display = 'none';
    createContainer.style.display = 'none';
    editContainer.style.display = 'none';
    statisticsContainer.style.display = 'none';
    mlContainer.style.display = 'none';
});
viewStatistics.addEventListener('click', () => {
    dataContainer.style.display = 'none';
    viewCreate.style.display = 'none';
    viewHome.style.display = 'block';
    createContainer.style.display = 'none';
    editContainer.style.display = 'none';
    statisticsContainer.style.display = 'flex';
    mlContainer.style.display = 'none';
    
    // Charger les statistiques par défaut (avis positifs)
    fetchStatistics('positive');
});
viewML.addEventListener('click', () => {
    dataContainer.style.display = 'none';
    viewCreate.style.display = 'none';
    viewHome.style.display = 'block';
    createContainer.style.display = 'none';
    editContainer.style.display = 'none';
    statisticsContainer.style.display = 'none';
    mlContainer.style.display = 'flex';
});

// Gérer la soumission des formulaires de création
const creationForm = document.getElementById('creationForm');
creationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('gameName').value;
    const developer = document.getElementById('gameDeveloper').value;
    const positive = parseInt(document.getElementById('gamePositive').value, 10);
    const negative = parseInt(document.getElementById('gameNegative').value, 10);
    const newGame = { name, developer, positive, negative };

    try {
        const response = await fetch('http://localhost:3000/games', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newGame)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // Clear the form after successful submission
        creationForm.reset();

        // Optionally, refresh the game list or provide feedback to the user
        fetchGames();
    } catch (error) {
        console.error('Error creating game:', error);
    }
});

// Gérer la soumission du formulaire d'édition
const editForm = document.getElementById('editingForm');
editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const gameId = editForm.getAttribute('data-game-id');
    
    if (!gameId) {
        console.error('No game ID found for editing');
        return;
    }
    
    const name = document.getElementById('editGameName').value;
    const developer = document.getElementById('editGameDeveloper').value;
    const positive = parseInt(document.getElementById('editGamePositive').value, 10);
    const negative = parseInt(document.getElementById('editGameNegative').value, 10);
    const updatedGame = { name, developer, positive, negative };
    
    try {
        const response = await fetch(`http://localhost:3000/games/${gameId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedGame)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        console.log('Game updated successfully');
        
        // Nettoyer le formulaire et l'attribut de données
        editForm.reset();
        editForm.removeAttribute('data-game-id');
        
        // Retour à la vue principale
        dataContainer.style.display = 'flex';
        viewCreate.style.display = 'block';
        viewHome.style.display = 'none';
        createContainer.style.display = 'none';
        editContainer.style.display = 'none';
        
        // Rafraîchir la liste des jeux
        location.reload();
    } catch (error) {
        console.error('Error updating game:', error);
    }
});



// 4. [ ANALYSE STATISTIQUE ]
async function fetchStatistics(variable = 'positive') {
    try {
        const response = await fetch(`http://localhost:3000/statistics?variable=${variable}`);

        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }
        const data = await response.json();

        // Afficher le graphique avec les statistiques récupérées
        const graphElement = document.getElementById('statisticsGraph');
        if (graphElement) {
            graphElement.src = `data:image/png;base64,${data.image_base64}`;
        }

        // Interpréter les statistiques textuelles
        interpretStatistics(data.stats, variable);

    } catch (error) {
        console.error('Erreur lors de la récupération des statistiques:', error);
    }
}
function interpretStatistics(stats, variable) {
    const { mean, median, std_dev, min, max } = stats;
    const interpretationElement = document.getElementById('statisticsInterpretation');
    if (interpretationElement) {
        interpretationElement.innerHTML = `
            <p><strong>Interprétation des statistiques pour "${variable}":</strong></p>
            <ul>
                <li><strong>Moyenne</strong> (${mean.toFixed(2)}): La valeur moyenne des avis ${variable} pour les jeux.</li>
                <li><strong>Médiane</strong> (${median.toFixed(2)}): La valeur centrale des avis ${variable}, indiquant que la moitié des jeux ont plus et l'autre moitié moins d'avis ${variable}.</li>
                <li><strong>écart-type</strong> (${std_dev.toFixed(2)}): Mesure de la dispersion des avis ${variable} autour de la moyenne. Un écart-type élevé indique une grande variabilité.</li>
                <li><strong>Valeur minimale</strong> (${min}): Le jeu avec le moins d'avis ${variable}.</li>
                <li><strong>Valeur maximale</strong> (${max}): Le jeu avec le plus d'avis ${variable}.</li>
            </ul>
        `;
    }
}



// 5. [ MACHINE LEARNING ]
// Fonction pour afficher le chargement
function showMLLoading() {
    document.getElementById('mlLoading').style.display = 'block';
    document.getElementById('mlResults').innerHTML = '';
}

function hideMLLoading() {
    document.getElementById('mlLoading').style.display = 'none';
}

// Fonction pour afficher les résultats Random Forest
function displayRandomForestResults(data) {
    const resultsDiv = document.getElementById('mlResults');
    let html = `
        <div class="ml-model-result">
            <h3><i class="fa-solid fa-tree"></i> ${data.model}</h3>
            <div class="ml-metrics">
                <div class="metric">
                    <span class="metric-label">Précision:</span>
                    <span class="metric-value">${(data.accuracy * 100).toFixed(2)}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Développeurs classifiés:</span>
                    <span class="metric-value">${data.developers_found}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Jeux analysés:</span>
                    <span class="metric-value">${data.total_games}</span>
                </div>
            </div>
            <div class="ml-graph">
                <img src="data:image/png;base64,${data.image_base64}" alt="Random Forest Results">
            </div>
            <div class="ml-games-list">
                <h4>Jeux représentatifs par développeur :</h4>
                <table class="ml-table">
                    <thead>
                        <tr>
                            <th>Nom</th>
                            <th>Développeur</th>
                            <th>Positifs</th>
                            <th>Négatifs</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    data.games_by_developer.forEach(game => {
        html += `
            <tr>
                <td>${game.name}</td>
                <td>${game.developer}</td>
                <td>${game.positive}</td>
                <td>${game.negative}</td>
            </tr>
        `;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    resultsDiv.innerHTML += html;
}

// Fonction pour afficher les résultats XGBoost
function displayXGBoostResults(data) {
    const resultsDiv = document.getElementById('mlResults');
    let html = `
        <div class="ml-model-result">
            <h3><i class="fa-solid fa-rocket"></i> XGBoost - Prédiction du Score de Pertinence</h3>
            <div class="ml-metrics">
                <div class="metric">
                    <span class="metric-label">R² Score:</span>
                    <span class="metric-value">${data.r2_score.toFixed(4)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Erreur Moyenne Absolue (MAE):</span>
                    <span class="metric-value">${data.mae.toFixed(2)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Erreur Quadratique Moyenne (MSE):</span>
                    <span class="metric-value">${data.mse.toFixed(2)}</span>
                </div>
            </div>
            <div class="ml-graph">
                <img src="data:image/png;base64,${data.image_base64}" alt="XGBoost Results">
            </div>
            <div class="ml-games-list">
                <h4>Jeux par Score de Pertinence:</h4>
                <table class="ml-table">
                    <thead>
                        <tr>
                            <th>Nom</th>
                            <th>Développeur</th>
                            <th>Positifs</th>
                            <th>Score Prédit</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    data.top_games.slice(0, 10).forEach(game => {
        html += `
            <tr>
                <td>${game.name}</td>
                <td>${game.developer}</td>
                <td>${game.positive}</td>
                <td>${game.predicted_score.toFixed(2)}</td>
            </tr>
        `;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    resultsDiv.innerHTML += html;
}

// Fonction pour afficher les résultats K-Means
function displayKMeansResults(data) {
    const resultsDiv = document.getElementById('mlResults');
    let html = `
        <div class="ml-model-result">
            <h3><i class="fa-solid fa-circle-nodes"></i> K-Means - Clustering Thématique</h3>
            <div class="ml-metrics">
                <div class="metric">
                    <span class="metric-label">Nombre de Clusters:</span>
                    <span class="metric-value">${data.n_clusters}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Jeu de référence:</span>
                    <span class="metric-value">${data.reference_game}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Cluster de référence:</span>
                    <span class="metric-value">${data.reference_cluster}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Jeux analysés:</span>
                    <span class="metric-value">${data.total_games_analyzed}</span>
                </div>
            </div>
            <div class="ml-graph">
                <img src="data:image/png;base64,${data.image_base64}" alt="K-Means Results">
            </div>
            <div class="ml-games-list">
                <h4>Jeux du même cluster que "${data.reference_game}":</h4>
                <table class="ml-table">
                    <thead>
                        <tr>
                            <th>Nom</th>
                            <th>Développeur</th>
                            <th>Positifs</th>
                            <th>Négatifs</th>
                            <th>Cluster</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    data.cluster_games.forEach(game => {
        html += `
            <tr>
                <td>${game.name}</td>
                <td>${game.developer}</td>
                <td>${game.positive}</td>
                <td>${game.negative}</td>
                <td>${game.cluster}</td>
            </tr>
        `;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    resultsDiv.innerHTML += html;
}

// Fonctions pour appeler les API ML
async function fetchRandomForest(searchQuery = null) {
    showMLLoading();
    try {
        const url = searchQuery 
            ? `http://localhost:5002/ml/random-forest?search=${encodeURIComponent(searchQuery)}`
            : 'http://localhost:5002/ml/random-forest';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }
        const data = await response.json();
        hideMLLoading();
        displayRandomForestResults(data);
    } catch (error) {
        hideMLLoading();
        console.error('Erreur Random Forest:', error);
        document.getElementById('mlResults').innerHTML = `
            <div class="ml-error">
                <i class="fa-solid fa-exclamation-triangle"></i>
                Erreur lors de l'exécution du modèle Random Forest. 
                Assurez-vous que le service ML est démarré sur le port 5002.
            </div>
        `;
    }
}

async function fetchXGBoost(searchQuery = null) {
    showMLLoading();
    try {
        const url = searchQuery 
            ? `http://localhost:5002/ml/xgboost?search=${encodeURIComponent(searchQuery)}`
            : 'http://localhost:5002/ml/xgboost';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }
        const data = await response.json();
        hideMLLoading();
        displayXGBoostResults(data);
    } catch (error) {
        hideMLLoading();
        console.error('Erreur XGBoost:', error);
        document.getElementById('mlResults').innerHTML = `
            <div class="ml-error">
                <i class="fa-solid fa-exclamation-triangle"></i>
                Erreur lors de l'exécution du modèle XGBoost.
                Assurez-vous que le service ML est démarré sur le port 5002.
            </div>
        `;
    }
}

async function fetchKMeans(searchQuery = null) {
    showMLLoading();
    try {
        const url = searchQuery 
            ? `http://localhost:5002/ml/kmeans?search=${encodeURIComponent(searchQuery)}`
            : 'http://localhost:5002/ml/kmeans';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }
        const data = await response.json();
        hideMLLoading();
        displayKMeansResults(data);
    } catch (error) {
        hideMLLoading();
        console.error('Erreur K-Means:', error);
        document.getElementById('mlResults').innerHTML = `
            <div class="ml-error">
                <i class="fa-solid fa-exclamation-triangle"></i>
                Erreur lors de l'exécution du modèle K-Means.
                Assurez-vous que le service ML est démarré sur le port 5002.
            </div>
        `;
    }
}

async function fetchAllMLModels(searchQuery = null) {
    showMLLoading();
    try {
        const url = searchQuery 
            ? `http://localhost:5002/ml/all?search=${encodeURIComponent(searchQuery)}`
            : 'http://localhost:5002/ml/all';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erreur HTTP! Statut: ${response.status}`);
        }
        const data = await response.json();
        hideMLLoading();
        
        // Afficher la requête de recherche si présente
        if (data.search_query) {
            document.getElementById('mlResults').innerHTML = `
                <div class="ml-info">
                    <h3>🔍 Analyse basée sur la recherche: "${data.search_query}"</h3>
                    <p>Classification ML des jeux correspondants...</p>
                </div>
            `;
        }
        
        // Afficher tous les résultats
        if (data.random_forest && !data.random_forest.error) {
            displayRandomForestResults(data.random_forest);
        }
        if (data.xgboost && !data.xgboost.error) {
            displayXGBoostResults(data.xgboost);
        }
        if (data.kmeans && !data.kmeans.error) {
            displayKMeansResults(data.kmeans);
        }
    } catch (error) {
        hideMLLoading();
        console.error('Erreur lors de l\'exécution de tous les modèles:', error);
        document.getElementById('mlResults').innerHTML = `
            <div class="ml-error">
                <i class="fa-solid fa-exclamation-triangle"></i>
                Erreur lors de l'exécution des modèles ML.
                Assurez-vous que le service ML est démarré sur le port 5002.
            </div>
        `;
    }
}

// Event listeners pour les boutons ML
document.getElementById('btnRandomForest').addEventListener('click', () => {
    const searchInput = document.getElementById('searchInput');
    const searchQuery = searchInput.value.trim();
    fetchRandomForest(searchQuery || null);
});

document.getElementById('btnXGBoost').addEventListener('click', () => {
    const searchInput = document.getElementById('searchInput');
    const searchQuery = searchInput.value.trim();
    fetchXGBoost(searchQuery || null);
});

document.getElementById('btnKMeans').addEventListener('click', () => {
    const searchInput = document.getElementById('searchInput');
    const searchQuery = searchInput.value.trim();
    fetchKMeans(searchQuery || null);
});

document.getElementById('btnAllModels').addEventListener('click', () => {
    const searchInput = document.getElementById('searchInput');
    const searchQuery = searchInput.value.trim();
    fetchAllMLModels(searchQuery || null);
});