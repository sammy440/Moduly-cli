import { ProjectReport } from '../types.js';

export const generateDashboard = (report: ProjectReport): string => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Moduly - ${report.projectName} Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg-color: #050505;
            --card-bg: #111111;
            --accent-color: #CCFF00;
            --text-primary: #ffffff;
            --text-secondary: #a0a0a0;
            --border-color: #222222;
        }

        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            margin: 0;
            padding: 20px;
            overflow-x: hidden;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 40px;
        }

        .logo {
            font-size: 2rem;
            font-weight: 800;
            color: var(--accent-color);
            letter-spacing: -1px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }

        .card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px;
            transition: transform 0.3s ease, border-color 0.3s ease;
        }

        .card:hover {
            transform: translateY(-5px);
            border-color: var(--accent-color);
        }

        .card h3 {
            margin: 0 0 10px 0;
            font-size: 0.9rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .card .value {
            font-size: 2.5rem;
            font-weight: 700;
        }

        .dashboard-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }

        .graph-card {
            grid-column: span 2;
            height: 500px;
            position: relative;
        }

        #dependencyGraph {
            width: 100%;
            height: 100%;
        }

        .chart-container {
            height: 300px;
        }

        .hotspots-list {
            list-style: none;
            padding: 0;
        }

        .hotspots-list li {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid var(--border-color);
        }

        .hotspots-list li:last-child {
            border-bottom: none;
        }

        .badge {
            background: rgba(204, 255, 0, 0.1);
            color: var(--accent-color);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .animate-fade-in {
            animation: fadeIn 0.8s ease-out forwards;
        }
    </style>
</head>
<body>
    <div class="container animate-fade-in">
        <header>
            <div class="logo">MODULY</div>
            <div class="date">${new Date(report.timestamp).toLocaleString()}</div>
        </header>

        <div class="stats-grid">
            <div class="card">
                <h3>Health Score</h3>
                <div class="value" style="color: var(--accent-color)">${report.score}</div>
            </div>
            <div class="card">
                <h3>Total Files</h3>
                <div class="value">${report.stats.totalFiles}</div>
            </div>
            <div class="card">
                <h3>Lines of Code</h3>
                <div class="value">${report.stats.totalLOC.toLocaleString()}</div>
            </div>
            <div class="card">
                <h3>Tech Stack</h3>
                <div class="value">${Object.keys(report.stats.languages).length} <span style="font-size: 1rem; color: var(--text-secondary)">Types</span></div>
            </div>
        </div>

        <div class="dashboard-grid">
            <div class="card graph-card">
                <h3 style="display:flex; justify-content:space-between; align-items:center">
                    Architecture Graph
                    <span style="font-size: 0.7rem; color: var(--text-secondary)">SCROLL TO ZOOM • DRAG TO MOVE</span>
                </h3>
                <div id="dependencyGraph"></div>
            </div>
            <div class="card">
                <h3>File Distribution</h3>
                <div class="chart-container">
                    <canvas id="langChart"></canvas>
                </div>
            </div>
            <div class="card">
                <h3>Git Hotspots</h3>
                <ul class="hotspots-list">
                    ${report.hotspots.length > 0 ? report.hotspots.map(h => `
                        <li>
                            <span title="${h.file}" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px;">${h.file}</span>
                            <span class="badge">${h.commits} commits</span>
                        </li>
                    `).join('') : '<li style="color:var(--text-secondary)">No git history found</li>'}
                </ul>
            </div>
            <div class="card" style="grid-column: span 2">
                 <h3>Largest Files</h3>
                 <div style="overflow-x: auto">
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                        <thead>
                            <tr style="text-align: left; color: var(--text-secondary); font-size: 0.8rem; border-bottom: 1px solid var(--border-color)">
                                <th style="padding: 10px">PATH</th>
                                <th style="padding: 10px">SIZE</th>
                                <th style="padding: 10px">LOC</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${report.stats.fileList
            .sort((a, b) => b.size - a.size)
            .slice(0, 5)
            .map(f => `
                                <tr style="border-bottom: 1px solid var(--border-color)">
                                    <td style="padding: 10px; font-size: 0.9rem">${f.path}</td>
                                    <td style="padding: 10px; font-size: 0.9rem">${(f.size / 1024).toFixed(1)} KB</td>
                                    <td style="padding: 10px; font-size: 0.9rem">${f.linesOfCode}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                 </div>
            </div>
        </div>
    </div>

    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script>
        // Language Chart
        const ctx = document.getElementById('langChart').getContext('2d');
        const labels = ${JSON.stringify(Object.keys(report.stats.languages))};
        const data = ${JSON.stringify(Object.values(report.stats.languages))};

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#CCFF00', '#00FFCC', '#FF00CC', '#CC00FF', '#00CCFF', '#FFFF00', '#00FFFF'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'right',
                        labels: {
                            color: '#a0a0a0',
                            font: { family: 'Outfit', size: 10 }
                        }
                    }
                }
            }
        });

        // D3 Dependency Graph
        const graphData = ${JSON.stringify(report.dependencies)};
        const width = document.getElementById('dependencyGraph').clientWidth;
        const height = document.getElementById('dependencyGraph').clientHeight;

        const svg = d3.select("#dependencyGraph")
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", [0, 0, width, height]);

        const g = svg.append("g");

        svg.call(d3.zoom()
            .extent([[0, 0], [width, height]])
            .scaleExtent([0.1, 8])
            .on("zoom", ({transform}) => g.attr("transform", transform)));

        const simulation = d3.forceSimulation(graphData.nodes)
            .force("link", d3.forceLink(graphData.links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("x", d3.forceX(width / 2).strength(0.1))
            .force("y", d3.forceY(height / 2).strength(0.1));

        const link = g.append("g")
            .attr("stroke", "#333")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(graphData.links)
            .join("line")
            .attr("stroke-width", 1);

        const node = g.append("g")
            .selectAll("g")
            .data(graphData.nodes)
            .join("g")
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        node.append("circle")
            .attr("r", d => 5 + (graphData.links.filter(l => l.target.id === d.id).length * 2))
            .attr("fill", d => {
                const ext = d.id.split('.').pop();
                if (ext === 'ts' || ext === 'tsx') return '#3178c6';
                if (ext === 'js' || ext === 'jsx') return '#f7df1e';
                return '#CCFF00';
            })
            .attr("stroke", "#000")
            .attr("stroke-width", 1.5);

        node.append("text")
            .attr("x", 8)
            .attr("y", "0.31em")
            .text(d => d.id.split('/').pop())
            .attr("fill", "#fff")
            .attr("font-size", "10px")
            .style("pointer-events", "none")
            .style("text-shadow", "0 0 4px #000");

        node.append("title")
            .text(d => d.id);

        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("transform", d => \`translate(\${d.x},\${d.y})\`);
        });

        function dragstarted(event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function dragged(event) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function dragended(event) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }
    </script>
</body>
</html>`;
};
