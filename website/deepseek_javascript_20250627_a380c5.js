// Configuration
const CONFIG = {
    DATA_CACHE_KEY: 'madrid_water_sources_cache',
    CACHE_EXPIRY_DAYS: 1,
    API_URL: 'https://datos.madrid.es/egob/catalogo/300356-0-fuentes-beber.json',
    FALLBACK_DATA_URL: 'data/sample-data.json' // Local fallback data
};

// Initialize the map centered on Madrid
const map = L.map('map').setView([40.4168, -3.7038], 13);

// Add OpenStreetMap base layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Store all water sources and markers
let allWaterSources = [];
let currentMarkers = [];
let districtList = [];

// Custom icons
const waterIcon = L.divIcon({
    className: 'water-icon',
    iconSize: [12, 12],
    html: '<div style="background-color: #3498db; width: 100%; height: 100%; border-radius: 50%;"></div>'
});

const operationalIcon = L.divIcon({
    className: 'water-icon',
    iconSize: [12, 12],
    html: '<div style="background-color: #2ecc71; width: 100%; height: 100%; border-radius: 50%;"></div>'
});

const nonOperationalIcon = L.divIcon({
    className: 'water-icon',
    iconSize: [12, 12],
    html: '<div style="background-color: #e74c3c; width: 100%; height: 100%; border-radius: 50%;"></div>'
});

// UI Elements
const loadingOverlay = document.getElementById('loadingOverlay');
const dataStatusElement = document.getElementById('dataStatus');

// Show loading indicator
function showLoading() {
    loadingOverlay.style.display = 'flex';
}

// Hide loading indicator
function hideLoading() {
    loadingOverlay.style.display = 'none';
}

// Show error message
function showError(message) {
    hideLoading();
    alert(message); // In production, you might want a prettier error display
}

// Get icon based on status
function getIconForSource(source) {
    if (!source.status) return waterIcon;
    if (source.status.toLowerCase().includes('operational')) return operationalIcon;
    if (source.status.toLowerCase().includes('non-operational') return nonOperationalIcon;
    return waterIcon;
}

// Update data status display
function updateDataStatus(timestamp) {
    if (!timestamp) {
        dataStatusElement.textContent = '';
        return;
    }
    
    const date = new Date(timestamp);
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    };
    dataStatusElement.textContent = `Data updated: ${date.toLocaleDateString('en-US', options)}`;
}

// Check if cached data is still valid
function isCacheValid(cachedData) {
    if (!cachedData || !cachedData.timestamp) return false;
    
    const cacheExpiry = new Date(cachedData.timestamp);
    cacheExpiry.setDate(cacheExpiry.getDate() + CONFIG.CACHE_EXPIRY_DAYS);
    
    return new Date() < cacheExpiry;
}

// Save data to localStorage
function saveToCache(data) {
    const cacheData = {
        data: data,
        timestamp: new Date().getTime()
    };
    localStorage.setItem(CONFIG.DATA_CACHE_KEY, JSON.stringify(cacheData));
    updateDataStatus(cacheData.timestamp);
}

// Get data from cache
function getFromCache() {
    const cached = localStorage.getItem(CONFIG.DATA_CACHE_KEY);
    if (!cached) return null;
    
    try {
        return JSON.parse(cached);
    } catch (e) {
        console.error('Error parsing cached data', e);
        return null;
    }
}

// Fetch data with CORS fallback
async function fetchWithFallback() {
    try {
        // First try the direct API
        const response = await fetch(CONFIG.API_URL);
        if (!response.ok) throw new Error('API response not OK');
        return await response.json();
    } catch (error) {
        console.warn('Failed to fetch from API, trying fallback:', error);
        
        // Try local fallback data
        try {
            const fallbackResponse = await fetch(CONFIG.FALLBACK_DATA_URL);
            if (!fallbackResponse.ok) throw new Error('Fallback response not OK');
            return await fallbackResponse.json();
        } catch (fallbackError) {
            console.error('Failed to fetch fallback data:', fallbackError);
            throw new Error('Could not load data from any source');
        }
    }
}

// Process and normalize data
function processData(rawData) {
    // This function normalizes the data structure from different sources
    if (rawData['@graph']) {
        return rawData['@graph'].map(item => ({
            id: item.id || item['@id'],
            name: item.title || item.name,
            type: item.organization?.['organization-desc'] || item.type,
            district: item.address?.['district-id'] || item.district,
            status: item.condition || item.status,
            location: {
                latitude: item.location?.latitude || item.latitude,
                longitude: item.location?.longitude || item.longitude
            },
            description: item.description,
            image: item.image
        }));
    }
    return rawData;
}

// Fetch water source data
async function fetchWaterSources() {
    showLoading();
    
    try {
        // Check cache first
        const cachedData = getFromCache();
        if (isCacheValid(cachedData)) {
            allWaterSources = processData(cachedData.data);
            updateDataStatus(cachedData.timestamp);
            console.log('Using cached data');
        } else {
            // Fetch fresh data
            console.log('Fetching fresh data');
            const data = await fetchWithFallback();
            allWaterSources = processData(data);
            saveToCache(data);
        }
        
        // Extract unique districts
        const districts = new Set();
        allWaterSources.forEach(source => {
            if (source.district) districts.add(source.district);
        });
        districtList = Array.from(districts).sort();
        
        // Populate district filter
        const districtFilter = document.getElementById('districtFilter');
        districtList.forEach(district => {
            const option = document.createElement('option');
            option.value = district;
            option.textContent = district;
            districtFilter.appendChild(option);
        });
        
        // Display all markers initially
        updateMarkers(allWaterSources);
        
    } catch (error) {
        showError(`Failed to load water source data: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Update markers on the map
function updateMarkers(sources) {
    // Clear existing markers
    currentMarkers.forEach(marker => map.removeLayer(marker));
    currentMarkers = [];
    
    // Add new markers
    sources.forEach(source => {
        if (source.location && source.location.latitude && source.location.longitude) {
            const marker = L.marker(
                [source.location.latitude, source.location.longitude],
                {icon: getIconForSource(source)}
            ).addTo(map);
            
            // Create detailed popup content
            const popupContent = document.createElement('div');
            
            // Add title
            const title = document.createElement('h5');
            title.textContent = source.name || 'Water Source';
            popupContent.appendChild(title);
            
            // Add image if available
            if (source.image) {
                const img = document.createElement('img');
                img.src = source.image;
                img.alt = source.name || 'Water source image';
                img.className = 'popup-image';
                popupContent.appendChild(img);
            }
            
            // Add details table
            const table = document.createElement('table');
            table.className = 'table table-sm';
            
            const addRow = (label, value) => {
                if (!value) return;
                const row = table.insertRow();
                const cell1 = row.insertCell(0);
                cell1.textContent = label;
                cell1.style.fontWeight = 'bold';
                const cell2 = row.insertCell(1);
                cell2.textContent = value;
            };
            
            addRow('Type:', source.type);
            addRow('District:', source.district);
            addRow('Status:', source.status);
            
            if (source.description) {
                const descRow = table.insertRow();
                const descCell = descRow.insertCell(0);
                descCell.colSpan = 2;
                descCell.textContent = source.description;
            }
            
            popupContent.appendChild(table);
            
            marker.bindPopup(popupContent);
            currentMarkers.push(marker);
        }
    });
    
    // Fit map to show all markers if there are any
    if (currentMarkers.length > 0) {
        const group = new L.featureGroup(currentMarkers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// Apply filters
function applyFilters() {
    const selectedDistricts = Array.from(document.getElementById('districtFilter').selectedOptions)
        .map(option => option.value);
    
    const selectedTypes = Array.from(document.getElementById('typeFilter').selectedOptions)
        .map(option => option.value);
    
    const onlyOperational = document.getElementById('operationalFilter').checked;
    
    const filtered = allWaterSources.filter(source => {
        // District filter
        if (selectedDistricts.length > 0 && !selectedDistricts.includes(source.district)) {
            return false;
        }
        
        // Type filter
        if (selectedTypes.length > 0 && !selectedTypes.includes(source.type)) {
            return false;
        }
        
        // Operational filter
        if (onlyOperational && (!source.status || !source.status.toLowerCase().includes('operational'))) {
            return false;
        }
        
        return true;
    });
    
    updateMarkers(filtered);
}

// Reset all filters
function resetFilters() {
    document.getElementById('districtFilter').selectedIndex = -1;
    document.getElementById('typeFilter').selectedIndex = -1;
    document.getElementById('operationalFilter').checked = true;
    applyFilters();
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    // Event listeners
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    
    // Load data
    fetchWaterSources();
    
    // Add a refresh button handler if you add one
    // document.getElementById('refreshData').addEventListener('click', fetchWaterSources);
});