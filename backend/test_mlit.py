import requests
import json

url = "https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001?year=2023&city=13204"
headers = {
    "Ocp-Apim-Subscription-Key": "0d93881d4cfe4cc0bd5569f9e5e174f7"
}
response = requests.get(url, headers=headers)
print(response.status_code)
data = response.json()
print(json.dumps(data.get('data', [])[:2], ensure_ascii=False, indent=2))
