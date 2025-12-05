// -----------------------------------------------------
// LÓGICA DA APLICAÇÃO (SCRIPT.JS)
// Importações do Firebase
// -----------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, query, onSnapshot, 
    addDoc, updateDoc, deleteDoc, doc, setLogLevel
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Variáveis de Configuração Global (Obrigatório)
const appId = window.globalAppId || 'default-app-id';
const firebaseConfig = window.globalFirebaseConfig;
const initialAuthToken = window.globalInitialAuthToken;

// Definição do caminho da coleção (Public Data)
const COLLECTION_NAME = 'shopping_list';
const COLLECTION_PATH = `artifacts/${appId}/public/data/${COLLECTION_NAME}`;

// Elementos DOM
const itemList = document.getElementById('item-list');
const statusMessage = document.getElementById('status-message');
const itemNameInput = document.getElementById('item-name');
const itemQuantityInput = document.getElementById('item-quantity');
const addButton = document.getElementById('add-button');
const userIdDisplay = document.getElementById('user-id-display');
const collectionPathDisplay = document.getElementById('collection-path-display');

let db, auth, userId = null;
let isAuthReady = false;
let isLocalMode = false; // Novo flag para o modo Live Server

// Variáveis para Persistência Local (Mock Data)
let localItems = [
    { id: 1, name: "Leite", quantity: 2, price: 4.50, is_purchased: true, created_at: Date.now() - 7200000 },
    { id: 2, name: "Pão de Forma", quantity: 1, price: 6.99, is_purchased: false, created_at: Date.now() - 3600000 },
];
let localNextId = localItems.length + 1;


// --- Funções de UI/UX ---

// Função para formatar preço (simples, mantida como mock)
const formatPrice = (price) => {
    return parseFloat(price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Função para mostrar modal customizado (substitui alert())
function alertModal(message, title = "Atenção", type = "indigo") {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    
    modal.classList.remove('invisible', 'opacity-0');
    modal.classList.add('visible', 'opacity-100');
    
    modal.querySelector('.border-t-4').className = `border-t-4 border-${type}-500`;
    modalTitle.textContent = title;
    modalMessage.textContent = message;
}

window.closeModal = function() {
    const modal = document.getElementById('custom-modal');
    modal.classList.remove('visible', 'opacity-100');
    modal.classList.add('invisible', 'opacity-0');
}

// Função para atualizar a mensagem de status
function updateStatusMessage(items, message = null) {
    statusMessage.classList.remove('text-red-400', 'text-yellow-400', 'pulse-dot');
    
    const totalItems = items.length;
    const purchasedItems = items.filter(item => item.is_purchased).length;
    
    if (message) {
        statusMessage.textContent = message;
        statusMessage.classList.add('text-green-400');
    } else if (isLocalMode) {
        statusMessage.textContent = `Modo Local: ${purchasedItems} de ${totalItems} itens (Não persistente).`;
        statusMessage.classList.add('text-indigo-400');
    } else if (totalItems > 0) {
        statusMessage.textContent = `Lista OK: ${purchasedItems} de ${totalItems} itens comprados.`;
        statusMessage.classList.add('text-green-400');
    } else {
         statusMessage.textContent = 'A lista está vazia! Adicione o primeiro item.';
        statusMessage.classList.add('text-yellow-400');
    }
}

// Função para desenhar a lista na tela (chamada por onSnapshot ou renderLocalItems)
function renderItems(items) {
    // ... Lógica de ordenação e renderização ...
    const sortedItems = items.sort((a, b) => {
        if (a.is_purchased !== b.is_purchased) {
            return a.is_purchased ? 1 : -1;
        }
        return b.created_at - a.created_at; 
    });

    itemList.innerHTML = ''; 

    if (sortedItems.length === 0) {
        itemList.innerHTML = '<p class="text-center text-gray-400 mt-8">A lista está vazia! Adicione o primeiro item.</p>';
        return;
    }

    sortedItems.forEach(item => {
        const isPurchased = item.is_purchased;
        const statusClass = isPurchased 
            ? 'bg-green-800/30 hover:bg-green-700/50 border-green-700' 
            : 'bg-slate-800/70 hover:bg-slate-700/90 border-slate-700';
        const textDecoration = isPurchased ? 'line-through text-gray-400' : 'text-white';
        const toggleBg = isPurchased ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600';
        const toggleText = isPurchased ? 'Desmarcar' : 'Comprar';
        const priceDisplay = item.price > 0 ? formatPrice(item.price) : 'Preço: N/A';
        
        const itemDiv = document.createElement('div');
        itemDiv.className = `p-4 flex flex-col md:flex-row justify-between items-start md:items-center rounded-xl shadow-2xl transition duration-300 border-l-4 ${statusClass}`;
        
        itemDiv.innerHTML = `
            <div class="flex-grow mb-3 md:mb-0">
                <p class="text-xl font-semibold ${textDecoration}">${item.name}</p>
                <p class="text-sm text-gray-400">
                    Qtd: ${item.quantity} | ${priceDisplay}
                </p>
            </div>
            <div class="flex items-center space-x-3">
                <div class="text-sm font-mono px-3 py-1 rounded-full ${isPurchased ? 'bg-green-600 text-white' : 'bg-yellow-500 text-slate-900'} shadow-inner">
                    ${isPurchased ? 'Comprado' : 'Faltando'}
                </div>
                <button data-id="${item.id}" class="toggle-btn px-4 py-2 rounded-lg font-bold text-slate-900 transition ${toggleBg} shadow-md">
                    ${toggleText}
                </button>
                <button data-id="${item.id}" class="delete-btn text-red-400 hover:text-red-500 transition p-2 rounded-full">
                    <!-- Ícone de Lixeira (Lucide Icon/Inline SVG) -->
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </button>
            </div>
        `;

        // Adiciona listeners para os botões (apontam para as funções genéricas)
        itemDiv.querySelector('.toggle-btn').addEventListener('click', () => togglePurchase(item.id, item.is_purchased));
        itemDiv.querySelector('.delete-btn').addEventListener('click', () => deleteItem(item.id, item.name));

        itemList.appendChild(itemDiv);
    });

    updateStatusMessage(items);
}


// --- Lógica CRUD para Firestore e Local ---

// Função principal de Adicionar
async function addItem() {
    const name = itemNameInput.value.trim();
    const quantity = parseInt(itemQuantityInput.value, 10);
    
    if (!isAuthReady) {
        alertModal("Aguarde a inicialização.", "Erro de Inicialização", "red");
        return;
    }

    if (name === "" || isNaN(quantity) || quantity < 1) {
        alertModal("Por favor, insira um nome válido e uma quantidade maior que 0.", "Validação", "yellow");
        return;
    }

    statusMessage.textContent = "Adicionando item...";
    statusMessage.classList.add('pulse-dot');

    const newItem = {
        name: name,
        quantity: quantity,
        price: 0.00, 
        is_purchased: false,
        created_at: Date.now(),
        user_id: userId
    };

    try {
        if (isLocalMode) {
            // Modo Local: Adiciona ao array local
            newItem.id = localNextId++;
            localItems.push(newItem);
            renderItems(localItems);
            updateStatusMessage(null, `Item '${name}' adicionado (Local).`);
        } else {
            // Modo Firestore: Adiciona ao Firestore
            await addDoc(collection(db, COLLECTION_PATH), newItem);
            updateStatusMessage(null, `Item '${name}' adicionado com sucesso!`);
        }
    } catch (error) {
        console.error("Erro ao adicionar documento:", error);
        alertModal(`Falha ao adicionar: ${error.message}`, "Erro no Firestore/Local", "red");
    } finally {
        statusMessage.classList.remove('pulse-dot');
        itemNameInput.value = '';
        itemQuantityInput.value = '1';
    }
}

// Função principal de Toggle Purchase (Comprar/Desmarcar)
async function togglePurchase(itemId, isPurchased) {
    if (!isAuthReady) return;

    try {
        if (isLocalMode) {
            // Modo Local: Atualiza o item no array
            const item = localItems.find(i => i.id === itemId);
            if (item) {
                item.is_purchased = !isPurchased;
                renderItems(localItems);
            }
        } else {
            // Modo Firestore: Atualiza no Firestore
            const itemRef = doc(db, COLLECTION_PATH, itemId);
            await updateDoc(itemRef, { is_purchased: !isPurchased });
        }
    } catch (error) {
        console.error("Erro ao atualizar item:", error);
        alertModal(`Falha ao atualizar o item. Tente novamente.`, "Erro de Persistência", "red");
    }
}

// Função principal de Deletar
async function deleteItem(itemId, itemName) {
    if (!isAuthReady) return;
    
    statusMessage.textContent = `Excluindo '${itemName}'...`;
    statusMessage.classList.add('pulse-dot');

    try {
        if (isLocalMode) {
            // Modo Local: Filtra o item e re-renderiza
            localItems = localItems.filter(i => i.id !== itemId);
            renderItems(localItems);
            updateStatusMessage(null, `Item '${itemName}' excluído (Local).`);
        } else {
            // Modo Firestore: Deleta do Firestore
            const itemRef = doc(db, COLLECTION_PATH, itemId);
            await deleteDoc(itemRef);
            updateStatusMessage(null, `Item '${itemName}' excluído.`);
        }
    } catch (error) {
        console.error("Erro ao excluir item:", error);
        alertModal(`Falha ao excluir: ${error.message}`, "Erro de Persistência", "red");
    } finally {
        statusMessage.classList.remove('pulse-dot');
    }
}

// --- Inicialização e Escuta de Dados ---

function listenForItems() {
    if (!isAuthReady || isLocalMode) return; // Não escuta se estiver no modo local

    const itemsCollection = collection(db, COLLECTION_PATH);
    const q = query(itemsCollection);

    onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach(doc => {
            items.push({ id: doc.id, ...doc.data() });
        });
        renderItems(items);
    }, (error) => {
        console.error("Erro ao ouvir coleção:", error);
        statusMessage.textContent = `Erro Fatal de Conexão: ${error.message}`;
        statusMessage.classList.replace('text-yellow-400', 'text-red-400');
    });
}

async function initApp() {
    statusMessage.textContent = "Inicializando...";
    statusMessage.classList.add('pulse-dot');

    // 1. CHECAGEM DE MODO LOCAL
    if (firebaseConfig.apiKey === "dummy-key") {
        console.warn("Modo Local (Live Server) detectado. Inicializando Mock Data.");
        isLocalMode = true;
        userId = "LOCAL_MOCK_USER";
        isAuthReady = true;

        // Atualiza a UI para o modo local
        userIdDisplay.textContent = `UID: ${userId} (MOCK)`;
        userIdDisplay.classList.add('text-indigo-400');
        collectionPathDisplay.textContent = 'local/memory/storage';
        
        // Renderiza itens locais
        renderItems(localItems);
        statusMessage.classList.remove('pulse-dot');
        return; 
    }
    
    // 2. MODO FIREBASE REAL
    
    setLogLevel('Debug');

    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        collectionPathDisplay.textContent = COLLECTION_PATH;

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                userIdDisplay.textContent = `UID: ${userId}`;
                userIdDisplay.classList.remove('text-gray-500');
                userIdDisplay.classList.add('text-indigo-400');
                isAuthReady = true;
                listenForItems(); 
            } else {
                userIdDisplay.textContent = "UID: Não autenticado";
                isAuthReady = false;
            }
            statusMessage.classList.remove('pulse-dot');
        });

    } catch (error) {
        console.error("Erro de Inicialização do Firebase:", error);
        statusMessage.textContent = `Erro de Inicialização: ${error.message}`;
        statusMessage.classList.replace('text-yellow-400', 'text-red-400');
        isAuthReady = false;
    }
}

// -----------------------------------------------------
// LISTENERS DE EVENTOS
// -----------------------------------------------------

addButton.addEventListener('click', addItem);
itemNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addItem();
    }
});
itemQuantityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addItem();
    }
});

// -----------------------------------------------------
// INICIALIZAÇÃO
// -----------------------------------------------------

initApp();