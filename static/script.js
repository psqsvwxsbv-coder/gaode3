document.addEventListener('DOMContentLoaded', function() {
    const geocodeBtn = document.getElementById('geocode-btn');
    const batchBtn = document.getElementById('batch-btn');
    const exportCsvBtn = document.getElementById('export-csv');
    const batchResultDiv = document.getElementById('batch-result');
    const batchTableBody = document.querySelector('#batch-table tbody');

    // 单个地址查询
    geocodeBtn.addEventListener('click', async function() {
        const apiKey = document.getElementById('api_key').value.trim();
        const address = document.getElementById('address').value.trim();
        const city = document.getElementById('city').value.trim();

        if (!apiKey || !address) {
            alert('请输入API Key和地址');
            return;
        }

        geocodeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 查询中...';
        geocodeBtn.disabled = true;

        try {
            const response = await fetch('/geocode', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    address: address,
                    city: city || null
                })
            });

            const data = await response.json();

            if (data.success) {
                displayResult(data);
            } else {
                alert('错误: ' + (data.error || '未知错误'));
            }
        } catch (error) {
            alert('请求失败: ' + error.message);
        } finally {
            geocodeBtn.innerHTML = '<i class="fas fa-search"></i> 查询坐标';
            geocodeBtn.disabled = false;
        }
    });

    // 批量处理
    batchBtn.addEventListener('click', async function() {
        const apiKey = document.getElementById('api_key').value.trim();
        const addressesText = document.getElementById('batch_addresses').value.trim();

        if (!apiKey) {
            alert('请输入API Key');
            return;
        }

        if (!addressesText) {
            alert('请输入地址列表');
            return;
        }

        const addresses = addressesText.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        batchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';
        batchBtn.disabled = true;

        try {
            const response = await fetch('/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    addresses: addresses
                })
            });

            const data = await response.json();

            if (data.success) {
                displayBatchResults(data.results);
                batchResultDiv.style.display = 'block';
                // 滚动到结果区域
                batchResultDiv.scrollIntoView({ behavior: 'smooth' });
            } else {
                alert('错误: ' + (data.error || '未知错误'));
            }
        } catch (error) {
            alert('请求失败: ' + error.message);
        } finally {
            batchBtn.innerHTML = '<i class="fas fa-bolt"></i> 批量转换';
            batchBtn.disabled = false;
        }
    });

    // 导出CSV
    exportCsvBtn.addEventListener('click', function() {
        const rows = Array.from(batchTableBody.querySelectorAll('tr'));
        if (rows.length === 0) {
            alert('没有数据可导出');
            return;
        }

        let csvContent = '序号,地址,GCJ-02经度,GCJ-02纬度,WGS-84经度,WGS-84纬度,格式化地址\n';

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const rowData = [
                cells[0].textContent,
                cells[1].textContent,
                cells[2].querySelector('.lng').textContent,
                cells[2].querySelector('.lat').textContent,
                cells[3].querySelector('.lng').textContent,
                cells[3].querySelector('.lat').textContent,
                cells[4].textContent
            ];

            csvContent += rowData.map(cell => `"${cell}"`).join(',') + '\n';
        });

        downloadFile(csvContent, '批量坐标转换结果.csv', 'text/csv');
    });


    // 显示单个查询结果
    function displayResult(data) {
        const resultDiv = document.getElementById('result');

        const html = `
            <div class="coordinate-result">
                <div class="address-info">
                    <h3><i class="fas fa-map-pin"></i> 地址信息</h3>
                    <div class="address-line"><strong>完整地址:</strong> ${data.address_info.formatted}</div>
                </div>

                <div class="coordinate-group">
                    <div class="coord-card">
                        <h4><i class="fas fa-map-marked-alt"></i> GCJ-02 坐标</h4>
                        <div class="coordinates">
                            <div class="lng">经度: ${data.coordinates.gcj02.lng}</div>
                            <div class="lat">纬度: ${data.coordinates.gcj02.lat}</div>
                        </div>
                        <div class="coord-description">${data.coordinates.gcj02.description}</div>
                    </div>

                    <div class="coord-card">
                        <h4><i class="fas fa-globe-americas"></i> WGS-84 坐标</h4>
                        <div class="coordinates">
                            <div class="lng">经度: ${data.coordinates.wgs84.lng}</div>
                            <div class="lat">纬度: ${data.coordinates.wgs84.lat}</div>
                        </div>
                        <div class="coord-description">${data.coordinates.wgs84.description}</div>
                    </div>
                </div>

                <div class="map-links">
                    <a href="${data.map_links.gaode}" target="_blank" class="map-link">
                        <i class="fas fa-map"></i> 高德地图
                    </a>
                    <button onclick="copyCoordinates(${data.coordinates.wgs84.lng}, ${data.coordinates.wgs84.lat})" class="map-link" style="border: none;">
                        <i class="fas fa-copy"></i> 复制坐标
                    </button>
                </div>
            </div>
        `;

        resultDiv.innerHTML = html;
    }

    // 显示批量处理结果
    function displayBatchResults(results) {
        batchTableBody.innerHTML = '';

        results.forEach(result => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${result.index}</td>
                <td>${result.address}</td>
                <td>
                    <div class="lng">${result.gcj02.lng}</div>
                    <div class="lat">${result.gcj02.lat}</div>
                </td>
                <td>
                    <div class="lng">${result.wgs84.lng}</div>
                    <div class="lat">${result.wgs84.lat}</div>
                </td>
                <td>${result.formatted_address}</td>
            `;
            batchTableBody.appendChild(row);
        });
    }

    // 下载文件
    function downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 复制坐标到剪贴板
    window.copyCoordinates = function(lng, lat) {
        const text = `${lng},${lat}`;
        navigator.clipboard.writeText(text)
            .then(() => {
                alert('坐标已复制到剪贴板: ' + text);
            })
            .catch(err => {
                console.error('复制失败:', err);
                alert('复制失败');
            });
    };

    // 示例数据填充
    function fillExampleData() {
        document.getElementById('api_key').value = '2d8602d00ba39d80bfc0395b8e4dd6a7';
        document.getElementById('address').value = '上海市杨浦区四平路1239号';
        document.getElementById('city').value = '上海';
        document.getElementById('batch_addresses').value = '北京市海淀区中关村\n上海市浦东新区陆家嘴\n广州市天河区珠江新城';
    }

    // 页面加载时填充示例数据（可选）
    // fillExampleData();
});