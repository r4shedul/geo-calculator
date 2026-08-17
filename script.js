// Geo-Calculator • Created & Developed by Rashedul Islam
let map, miniMap;
let baseLayers = {};
let miniBaseLayers = {};
let currentMode = 'distance'; // 'distance', 'area', 'perimeter', 'road', 'gps'
let points = [];
let markers = [];
let activePolyline = null;
let activePolygon = null;
let roadRouteLayer = null;
let segmentLabels = [];

// Unit Selection State per mode
let activeUnit = {
    distance: 'Meter',
    area: 'শতাংশ / Decimal',
    perimeter: 'Meter',
    road: 'Kilometer',
    gps: 'Kilometer'
};

// GPS Tracking State
let isGpsTracking = false;
let watchId = null;
let gpsPath = [];
let gpsPolyline = null;
let gpsStartTime = null;
let totalGpsDistance = 0;

// Initialize Leaflet Map and Mini Zoom Magnifier
function initMap() {
    map = L.map('map', { 
        zoomControl: false, 
        attributionControl: true,
        tap: true 
    }).setView([23.8103, 90.4125], 14);

    // Standard OpenStreetMap Tile Layer
    baseLayers.standard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'Geo-Calculator © 2026 Rashedul Islam'
    }).addTo(map);

    // Google Hybrid Satellite Layer
    baseLayers.satellite = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: 'Geo-Calculator © 2026 Rashedul Islam'
    });

    // Corner Mini Zoom Magnifier Map
    miniMap = L.map('magnifier-map', {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        touchZoom: false,
        keyboard: false
    }).setView([23.8103, 90.4125], 18);

    miniBaseLayers.standard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMap);
    miniBaseLayers.satellite = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    map.on('click', handleMapClick);
}

// Custom Marker Icon with Red Border and White Center
const customMarkerIcon = L.divIcon({
    className: 'custom-vertex-marker',
    html: '<div style="width: 14px; height: 14px; background-color: #ffffff; border: 2.5px solid #ef4444; border-radius: 50%;"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

// Magnifier Position Controls
function updateMagnifierSide(latlng) {
    const box = document.getElementById('magnifier-box');
    const rect = box.getBoundingClientRect();
    const point = map.latLngToContainerPoint(latlng);

    const boxWidth = rect.width || 128;
    const boxHeight = rect.height || 128;
    const margin = 16;  // matches the top-4 / left-4 offset (1rem)
    const buffer = 30;  // flip a little before the finger/point actually reaches the box

    const isUnderMagnifier = point.x < margin + boxWidth + buffer && point.y < margin + boxHeight + buffer;

    box.classList.toggle('magnifier-right', isUnderMagnifier);
}

function showMagnifier(latlng) {
    const box = document.getElementById('magnifier-box');
    box.classList.remove('hidden');
    updateMagnifierSide(latlng);
    miniMap.invalidateSize();
    miniMap.setView(latlng, Math.min(map.getZoom() + 4, 19), { animate: false });
}

function updateMagnifier(latlng) {
    updateMagnifierSide(latlng);
    miniMap.setView(latlng, Math.min(map.getZoom() + 4, 19), { animate: false });
}

function hideMagnifier() {
    document.getElementById('magnifier-box').classList.add('hidden');
}

// Handle Map Clicks & Touch Points
function handleMapClick(e) {
    if (currentMode === 'gps') return;

    const latlng = e.latlng;
    points.push(latlng);

    const marker = L.marker(latlng, { icon: customMarkerIcon, draggable: true }).addTo(map);
    
    // Attach Drag and Touch Listeners for Mobile & PC Magnifier
    marker.on('dragstart', (evt) => {
        if (map.dragging) map.dragging.disable();
        showMagnifier(evt.target.getLatLng());
    });

    marker.on('drag', (evt) => {
        const index = markers.indexOf(marker);
        if (index !== -1) {
            points[index] = marker.getLatLng();
            updateMeasurements();
        }
        updateMagnifier(evt.target.getLatLng());
    });

    marker.on('dragend', () => {
        if (map.dragging) map.dragging.enable();
        hideMagnifier();
    });

    // Touch events for Mobile Devices
    marker.on('add', () => {
        const iconEl = marker.getElement();
        if (iconEl) {
            iconEl.addEventListener('touchstart', (e) => {
                showMagnifier(marker.getLatLng());
            }, { passive: true });
            
            iconEl.addEventListener('touchmove', (e) => {
                updateMagnifier(marker.getLatLng());
            }, { passive: true });
            
            iconEl.addEventListener('touchend', () => {
                hideMagnifier();
            }, { passive: true });
        }
    });

    markers.push(marker);
    updateMeasurements();
}

// Draw segment distance labels
function addSegmentLabel(p1, p2, text) {
    const midLat = (p1.lat + p2.lat) / 2;
    const midLng = (p1.lng + p2.lng) / 2;
    const icon = L.divIcon({
        className: 'custom-map-label',
        html: `<div style="background: rgba(30, 41, 59, 0.88); color: white; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 12px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transform: translate(-50%, -50%); pointer-events: none;">${text}</div>`,
        iconSize: [0, 0]
    });
    const marker = L.marker([midLat, midLng], { icon: icon, interactive: false }).addTo(map);
    segmentLabels.push(marker);
}

function drawSegmentLabels(ptArray, connectLoop = false) {
    for (let i = 0; i < ptArray.length - 1; i++) {
        let dist = ptArray[i].distanceTo(ptArray[i + 1]);
        addSegmentLabel(ptArray[i], ptArray[i + 1], `${dist.toFixed(2)} m`);
    }
    if (connectLoop && ptArray.length > 2) {
        let dist = ptArray[ptArray.length - 1].distanceTo(ptArray[0]);
        addSegmentLabel(ptArray[ptArray.length - 1], ptArray[0], `${dist.toFixed(2)} m`);
    }
}

// Clear visual polyline & polygon overlays
function clearVisualLayers() {
    if (activePolyline) map.removeLayer(activePolyline);
    if (activePolygon) map.removeLayer(activePolygon);
    if (roadRouteLayer) map.removeLayer(roadRouteLayer);
    segmentLabels.forEach(lbl => map.removeLayer(lbl));
    segmentLabels = [];
}

// Main Calculation Router
function updateMeasurements() {
    clearVisualLayers();

    if (currentMode === 'distance') {
        renderDistanceMode();
    } else if (currentMode === 'area') {
        renderAreaMode();
    } else if (currentMode === 'perimeter') {
        renderPerimeterMode();
    } else if (currentMode === 'road') {
        renderRoadMode();
    }
}

// 1. Distance Mode
function renderDistanceMode() {
    let totalDist = 0;
    if (points.length >= 2) {
        activePolyline = L.polyline(points, { color: '#ef4444', weight: 3 }).addTo(map);
        drawSegmentLabels(points, false);
        for (let i = 0; i < points.length - 1; i++) {
            totalDist += points[i].distanceTo(points[i + 1]);
        }
    }

    const results = {
        'Meter': `${totalDist.toFixed(2)} m`,
        'Kilometer': `${(totalDist / 1000).toFixed(3)} km`,
        'Mile': `${(totalDist * 0.000621371).toFixed(3)} mi`,
        'Feet': `${(totalDist * 3.28084).toFixed(1)} ft`
    };

    setupUnitChips(results, 'distance');
    
    const primary = results[activeUnit['distance']];
    const secondary = Object.entries(results).filter(([k]) => k !== activeUnit['distance']).map(([_, v]) => v);
    
    displayResults(`Total Distance: ${primary}`, secondary);
}

// 2. Area Mode
function renderAreaMode() {
    let areaSqm = 0;
    
    if (points.length >= 3) {
        activePolygon = L.polygon(points, { color: '#475569', fillColor: '#cbd5e1', fillOpacity: 0.6, weight: 2 }).addTo(map);
        drawSegmentLabels(points, true);
        areaSqm = calculatePolygonArea(points);
    }

    const shatangsho = areaSqm / 40.4686; 
    const sqft = areaSqm * 10.7639;
    const acre = areaSqm * 0.000247105;
    const hectare = areaSqm / 10000;
    const katha = shatangsho / 1.65;
    const bigha = shatangsho / 33;

    const results = {
        'শতাংশ / Decimal': `${shatangsho.toFixed(2)} শতাংশ`,
        'Square Feet': `${sqft.toLocaleString(undefined, {maximumFractionDigits:0})} sq ft`,
        'Square Meter': `${areaSqm.toLocaleString(undefined, {maximumFractionDigits:0})} m²`,
        'Acre': `${acre.toFixed(2)} acre`,
        'Hectare': `${hectare.toFixed(4)} ha`,
        'Katha': `${katha.toFixed(2)} Katha`,
        'Bigha': `${bigha.toFixed(2)} Bigha`
    };

    setupUnitChips(results, 'area');
    
    const primary = results[activeUnit['area']];
    const secondary = Object.entries(results).filter(([k]) => k !== activeUnit['area']).slice(0, 3).map(([_, v]) => v);
    
    displayResults(`Total Area: ${primary}`, secondary);
}

// 3. Perimeter Mode
function renderPerimeterMode() {
    let singleLapDist = 0;

    if (points.length >= 3) {
        const loopPoints = [...points, points[0]];
        activePolyline = L.polyline(loopPoints, { color: '#8b5cf6', weight: 3, dashArray: '5, 5' }).addTo(map);
        drawSegmentLabels(points, true);

        for (let i = 0; i < loopPoints.length - 1; i++) {
            singleLapDist += loopPoints[i].distanceTo(loopPoints[i + 1]);
        }
    }

    const laps = parseInt(document.getElementById('loop-count').value) || 1;
    const totalDist = singleLapDist * laps;

    const results = {
        'Meter': `${totalDist.toFixed(2)} m`,
        'Kilometer': `${(totalDist / 1000).toFixed(3)} km`,
        'Mile': `${(totalDist * 0.000621371).toFixed(3)} mi`
    };

    setupUnitChips(results, 'perimeter');
    const primary = results[activeUnit['perimeter']];
    
    displayResults(`Total Distance: ${primary}`, [
        `1 Round: ${singleLapDist.toFixed(2)} m`,
        `Total Laps: ${laps}`,
        `${(totalDist / 1000).toFixed(3)} km`
    ]);
}

// 4. Road Distance Mode
function renderRoadMode() {
    if (points.length < 2) {
        const emptyResults = { 'Kilometer': '0.00 km', 'Meter': '0 m', 'Mile': '0 mi' };
        setupUnitChips(emptyResults, 'road');
        displayResults(`Road Distance: ${emptyResults[activeUnit['road']]}`, ['0 m', '0 mi']);
        return;
    }

    const coordsString = points.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const routeCoords = route.geometry.coordinates.map(c => [c[1], c[0]]);

                if (roadRouteLayer) map.removeLayer(roadRouteLayer);
                
                roadRouteLayer = L.polyline(routeCoords, { color: '#3b82f6', weight: 5, opacity: 0.85 }).addTo(map);

                const distMeters = route.distance;
                const results = {
                    'Kilometer': `${(distMeters / 1000).toFixed(3)} km`,
                    'Meter': `${distMeters.toFixed(0)} m`,
                    'Mile': `${(distMeters * 0.000621371).toFixed(3)} mi`
                };

                setupUnitChips(results, 'road');
                const primary = results[activeUnit['road']];
                const secondary = Object.entries(results).filter(([k]) => k !== activeUnit['road']).map(([_, v]) => v);
                secondary.push('via OSRM');
                
                displayResults(`Road Distance: ${primary}`, secondary);
            }
        })
        .catch(err => console.error("OSRM Route fetch error:", err));
}

// 5. GPS Tracking Mode
function toggleGpsTracking() {
    const btn = document.getElementById('btn-gps-toggle');

    if (!isGpsTracking) {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser");
            return;
        }

        isGpsTracking = true;
        btn.innerText = "Stop Tracking";
        btn.className = "flex-1 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition";
        gpsPath = [];
        totalGpsDistance = 0;
        gpsStartTime = new Date();

        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const newLatlng = L.latLng(pos.coords.latitude, pos.coords.longitude);

                if (gpsPath.length > 0) {
                    const prev = gpsPath[gpsPath.length - 1];
                    totalGpsDistance += prev.distanceTo(newLatlng);
                }

                gpsPath.push(newLatlng);
                map.setView(newLatlng, 16);

                if (gpsPolyline) map.removeLayer(gpsPolyline);
                gpsPolyline = L.polyline(gpsPath, { color: '#2563eb', weight: 5 }).addTo(map);

                const elapsedSec = (new Date() - gpsStartTime) / 1000;
                const avgSpeedKmh = elapsedSec > 0 ? (totalGpsDistance / elapsedSec) * 3.6 : 0;

                displayResults(
                    `GPS Dist: ${(totalGpsDistance / 1000).toFixed(3)} km`,
                    [
                        `Time: ${Math.floor(elapsedSec / 60)}m ${Math.floor(elapsedSec % 60)}s`,
                        `Speed: ${avgSpeedKmh.toFixed(1)} km/h`
                    ]
                );
            },
            (err) => console.error(err),
            { enableHighAccuracy: true }
        );
    } else {
        isGpsTracking = false;
        navigator.geolocation.clearWatch(watchId);
        btn.innerText = "Start Tracking";
        btn.className = "flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition";
    }
}

// Area Calculation Helper
function calculatePolygonArea(latlngs) {
    let area = 0;
    const R = 6378137;
    const centerLat = latlngs.reduce((sum, p) => sum + p.lat, 0) / latlngs.length;
    const latRad = (centerLat * Math.PI) / 180;

    const projectedPoints = latlngs.map(p => ({
        x: ((p.lng * Math.PI) / 180) * R * Math.cos(latRad),
        y: ((p.lat * Math.PI) / 180) * R
    }));

    const numPoints = projectedPoints.length;
    for (let i = 0; i < numPoints; i++) {
        let j = (i + 1) % numPoints;
        area += projectedPoints[i].x * projectedPoints[j].y;
        area -= projectedPoints[j].x * projectedPoints[i].y;
    }
    return Math.abs(area) / 2;
}

// UI Rendering Helpers
function displayResults(primary, secondaryArray) {
    document.getElementById('primary-result').innerText = primary;
    const secContainer = document.getElementById('secondary-results');
    secContainer.innerHTML = '';
    
    if (secondaryArray && secondaryArray.length > 0) {
        secondaryArray.forEach((secText, idx) => {
            const mlClass = idx === 0 ? '' : 'ml-3';
            secContainer.innerHTML += `<span class="text-gray-800 font-semibold ${mlClass}">${secText}</span>`;
        });
    }
}

function setupUnitChips(unitsObj, mode) {
    const chipContainer = document.getElementById('unit-chips');
    chipContainer.innerHTML = '';

    if (!activeUnit[mode]) {
        activeUnit[mode] = Object.keys(unitsObj)[0];
    }

    Object.keys(unitsObj).forEach((unitName) => {
        const chip = document.createElement('span');
        chip.className = `unit-chip ${activeUnit[mode] === unitName ? 'active' : ''}`;
        chip.innerText = unitName;
        
        chip.onclick = () => {
            activeUnit[mode] = unitName;
            updateMeasurements();
        };
        
        chipContainer.appendChild(chip);
    });
}

function clearAllPoints() {
    points = [];
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    clearVisualLayers();
    updateMeasurements();
}

function undoLastPoint() {
    if (points.length === 0) return;
    points.pop();
    const lastMarker = markers.pop();
    if (lastMarker) map.removeLayer(lastMarker);
    updateMeasurements();
}

// Event Listeners Initialization
function setupEventListeners() {
    // Custom Map Controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => map.zoomIn());
    document.getElementById('btn-zoom-out').addEventListener('click', () => map.zoomOut());
    document.getElementById('btn-locate').addEventListener('click', () => map.locate({ setView: true, maxZoom: 16 }));
    
    document.getElementById('btn-fullscreen').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    });

    document.getElementById('btn-layer-map').addEventListener('click', (e) => {
        map.removeLayer(baseLayers.satellite);
        map.addLayer(baseLayers.standard);
        miniMap.removeLayer(miniBaseLayers.satellite);
        miniMap.addLayer(miniBaseLayers.standard);

        e.target.classList.add('bg-white/90', 'text-gray-900', 'shadow-sm', 'border', 'border-gray-200/50');
        e.target.classList.remove('text-gray-700');
        const satBtn = document.getElementById('btn-layer-sat');
        satBtn.classList.remove('bg-white/90', 'text-gray-900', 'shadow-sm', 'border', 'border-gray-200/50');
        satBtn.classList.add('text-gray-700');
    });

    document.getElementById('btn-layer-sat').addEventListener('click', (e) => {
        map.removeLayer(baseLayers.standard);
        map.addLayer(baseLayers.satellite);
        miniMap.removeLayer(miniBaseLayers.standard);
        miniMap.addLayer(miniBaseLayers.satellite);

        e.target.classList.add('bg-white/90', 'text-gray-900', 'shadow-sm', 'border', 'border-gray-200/50');
        e.target.classList.remove('text-gray-700');
        const mapBtn = document.getElementById('btn-layer-map');
        mapBtn.classList.remove('bg-white/90', 'text-gray-900', 'shadow-sm', 'border', 'border-gray-200/50');
        mapBtn.classList.add('text-gray-700');
    });

    // Measurement Mode Switcher
    const modeButtons = {
        'btn-distance': 'distance',
        'btn-area': 'area',
        'btn-perimeter': 'perimeter',
        'btn-road': 'road',
        'btn-gps': 'gps'
    };

    Object.keys(modeButtons).forEach(id => {
        document.getElementById(id).addEventListener('click', (e) => {
            document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            currentMode = modeButtons[id];
            
            document.getElementById('loop-control').classList.toggle('hidden', currentMode !== 'perimeter');
            document.getElementById('gps-controls').classList.toggle('hidden', currentMode !== 'gps');

            updateMeasurements();
        });
    });

    document.getElementById('loop-count').addEventListener('input', updateMeasurements);
    
    // Undo Handlers
    document.getElementById('btn-undo').addEventListener('click', undoLastPoint);
    document.getElementById('btn-floating-undo').addEventListener('click', undoLastPoint);
    
    document.getElementById('btn-clear').addEventListener('click', clearAllPoints);
    document.getElementById('btn-finish').addEventListener('click', () => {
        if (points.length > 0) map.fitBounds(L.latLngBounds(points));
    });

    document.getElementById('btn-my-location').addEventListener('click', () => map.locate({ setView: true, maxZoom: 16 }));
    document.getElementById('btn-reset-map').addEventListener('click', () => {
        clearAllPoints();
        map.setView([23.8103, 90.4125], 14);
    });

    // Mobile Bottom Sheet Toggles
    const sidebar = document.getElementById('sidebar');
    const floatingBar = document.getElementById('mobile-floating-bar');
    
    document.getElementById('close-sidebar').addEventListener('click', () => {
        sidebar.classList.add('translate-y-full');
        setTimeout(() => {
            floatingBar.classList.remove('hidden');
            floatingBar.classList.add('flex');
        }, 150);
    });

    document.getElementById('btn-show-tools').addEventListener('click', () => {
        floatingBar.classList.add('hidden');
        floatingBar.classList.remove('flex');
        sidebar.classList.remove('translate-y-full');
    });

    document.getElementById('btn-gps-toggle').addEventListener('click', toggleGpsTracking);
    
    renderDistanceMode(); 
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEventListeners();
});
