from flask import Flask, render_template, request, jsonify, session
import requests
import math
import secrets

app = Flask(__name__, static_folder='static', template_folder='.')

def get_coordinates_simple(api_key: str, address: str, city: str = None):
    """从高德地图API获取坐标"""
    url = "https://restapi.amap.com/v3/geocode/geo"
    params = {
        "key": api_key,
        "address": address,
        "output": "json"
    }

    if city:
        params["city"] = city

    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()

        if data["status"] == "1" and data["geocodes"]:
            location = data["geocodes"][0]["location"]
            lng, lat = map(float, location.split(","))

            # 获取详细地址信息
            formatted_address = data["geocodes"][0].get("formatted_address", "")
            province = data["geocodes"][0].get("province", "")
            city_name = data["geocodes"][0].get("city", "")
            district = data["geocodes"][0].get("district", "")

            return {
                "gcj02": {"lng": lng, "lat": lat},
                "address_info": {
                    "formatted": formatted_address,
                    "province": province,
                    "city": city_name,
                    "district": district
                }
            }
        else:
            return {"error": data.get("info", "地址解析失败")}
    except Exception as e:
        return {"error": f"请求失败: {str(e)}"}


def gcj02_to_wgs84(lng, lat):
    """简化的GCJ-02转WGS-84函数"""
    PI = math.pi
    A = 6378245.0
    EE = 0.00669342162296594323

    def transform_lat(x, y):
        ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
        ret += (20.0 * math.sin(6.0 * x * PI) + 20.0 * math.sin(2.0 * x * PI)) * 2.0 / 3.0
        ret += (20.0 * math.sin(y * PI) + 40.0 * math.sin(y / 3.0 * PI)) * 2.0 / 3.0
        ret += (160.0 * math.sin(y / 12.0 * PI) + 320 * math.sin(y * PI / 30.0)) * 2.0 / 3.0
        return ret

    def transform_lng(x, y):
        ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
        ret += (20.0 * math.sin(6.0 * x * PI) + 20.0 * math.sin(2.0 * x * PI)) * 2.0 / 3.0
        ret += (20.0 * math.sin(x * PI) + 40.0 * math.sin(x / 3.0 * PI)) * 2.0 / 3.0
        ret += (150.0 * math.sin(x / 12.0 * PI) + 300.0 * math.sin(x / 30.0 * PI)) * 2.0 / 3.0
        return ret

    # 执行转换
    dlat = transform_lat(lng - 105.0, lat - 35.0)
    dlng = transform_lng(lng - 105.0, lat - 35.0)
    radlat = lat / 180.0 * PI
    magic = math.sin(radlat)
    magic = 1 - EE * magic * magic
    sqrtmagic = math.sqrt(magic)
    dlat = (dlat * 180.0) / ((A * (1 - EE)) / (magic * sqrtmagic) * PI)
    dlng = (dlng * 180.0) / (A / sqrtmagic * math.cos(radlat) * PI)

    wgslat = lat - dlat
    wgslng = lng - dlng

    return wgslng, wgslat


@app.route('/')
def index():
    """主页"""
    return render_template('index.html')


@app.route('/geocode', methods=['POST'])
def geocode():
    """处理地理编码请求"""
    try:
        data = request.json
        api_key = data.get('api_key', '').strip()
        address = data.get('address', '').strip()
        city = data.get('city', '').strip() or None

        if not api_key:
            return jsonify({"error": "请输入API Key"})
        if not address:
            return jsonify({"error": "请输入地址"})

        # 获取GCJ-02坐标
        result = get_coordinates_simple(api_key, address, city)

        if "error" in result:
            return jsonify(result)

        # 转换为WGS-84
        gcj02_coords = result["gcj02"]
        wgs84_lng, wgs84_lat = gcj02_to_wgs84(gcj02_coords["lng"], gcj02_coords["lat"])

        response = {
            "success": True,
            "address_info": result["address_info"],
            "coordinates": {
                "gcj02": {
                    "lng": round(gcj02_coords["lng"], 6),
                    "lat": round(gcj02_coords["lat"], 6),
                    "description": "高德地图坐标系（国测局坐标）"
                },
                "wgs84": {
                    "lng": round(wgs84_lng, 6),
                    "lat": round(wgs84_lat, 6),
                    "description": "国际标准GPS坐标"
                }
            },
            "map_links": {
                "gaode": f"https://uri.amap.com/marker?position={gcj02_coords['lng']},{gcj02_coords['lat']}",
                "google": f"https://www.google.com/maps/search/?api=1&query={wgs84_lat},{wgs84_lng}",
                "baidu": f"https://api.map.baidu.com/marker?location={wgs84_lat},{wgs84_lng}&title=位置&output=html"
            }
        }

        return jsonify(response)

    except Exception as e:
        return jsonify({"error": f"服务器错误: {str(e)}"})


@app.route('/batch', methods=['POST'])
def batch_geocode():
    """批量处理地址"""
    try:
        data = request.json
        api_key = data.get('api_key', '').strip()
        addresses = data.get('addresses', [])

        if not api_key:
            return jsonify({"error": "请输入API Key"})

        results = []
        for i, address in enumerate(addresses[:50]):  # 限制最多50个
            if isinstance(address, dict):
                addr = address.get('address', '').strip()
                city = address.get('city', '').strip() or None
            else:
                addr = str(address).strip()
                city = None

            if addr:
                result = get_coordinates_simple(api_key, addr, city)
                if "error" not in result:
                    gcj02 = result["gcj02"]
                    wgs84_lng, wgs84_lat = gcj02_to_wgs84(gcj02["lng"], gcj02["lat"])

                    results.append({
                        "index": i + 1,
                        "address": addr,
                        "gcj02": {"lng": round(gcj02["lng"], 6), "lat": round(gcj02["lat"], 6)},
                        "wgs84": {"lng": round(wgs84_lng, 6), "lat": round(wgs84_lat, 6)},
                        "formatted_address": result["address_info"]["formatted"]
                    })

        return jsonify({"success": True, "results": results, "count": len(results)})

    except Exception as e:
        return jsonify({"error": f"批量处理失败: {str(e)}"})

# 添加静态文件路由
@app.route('/<path:filename>')
def static_files(filename):
    return app.send_static_file(filename)


