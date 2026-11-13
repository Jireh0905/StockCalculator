"""
종목 목록 만들기  (실행: py tools/update-stocks.py  →  data/stocks.json, data/us-stocks.json)

종목 정보 화면의 검색은 이 파일(data/stocks.json)에서 찾아요.
브라우저는 한국거래소·네이버 목록을 직접 못 받아서(CORS), 내 PC에서 이 스크립트로 받아 파일로 만들어 둬요.
새로 상장된 종목을 검색에 넣고 싶을 때 한 번 실행하고 커밋·배포하면 돼요.

받는 곳
  - 한국거래소 KIND 상장법인 목록 (코스피·코스닥)  kind.krx.co.kr  (엑셀처럼 생긴 HTML, CP949)
  - 네이버 증권 ETF 목록                           finance.naver.com/api/sise/etfItemList.nhn
  - 네이버 증권 시세 (시가총액 순서를 정하려고)      polling.finance.naver.com

만드는 모양 (용량을 줄이려고 배열로)
  { "updated": "2026-11-13", "items": [["005930", "삼성전자", "K"], ...] }
  시장: K = 코스피, Q = 코스닥, E = ETF.  시가총액이 큰 순서로 적어요.

미국 종목 (data/us-stocks.json)
  - 네이버 해외주식 목록 (나스닥·NYSE·AMEX, 한글 이름)   api.stock.naver.com
  - 트레이딩뷰 scanner (트레이딩뷰 거래소 이름 확인, 주요 ETF)  scanner.tradingview.com
  { "updated": "...", "items": [["AAPL", "애플", "Apple Inc.", "NASDAQ", "S"], ...] }   S = 주식, E = ETF
"""
import html
import json
import os
import re
import sys
import time
import urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'stocks.json')
UA = {'User-Agent': 'Mozilla/5.0'}

KIND = 'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType={}'
ETF = 'https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0&targetColumn=market_sum&sortOrder=desc'


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read()


def decode(raw):
    """UTF-8이 아니면 CP949(한국어 윈도우 인코딩)로 읽어요"""
    try:
        return raw.decode('utf-8')
    except UnicodeDecodeError:
        return raw.decode('cp949')


def cells(row, tag):
    """<td>/<th> 칸의 글자들"""
    return [html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in re.findall(rf'<{tag}[^>]*>(.*?)</{tag}>', row, re.S)]


def kind_list(market_type, mark):
    """KIND 목록에서 회사명과 종목코드를 꺼내요 (칸 순서는 머리글 이름으로 찾아요)"""
    text = decode(get(KIND.format(market_type)))
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', text, re.S)
    head = cells(rows[0], 'th') if rows else []
    if '회사명' not in head or '종목코드' not in head:
        return []
    name_at, code_at = head.index('회사명'), head.index('종목코드')
    items = []
    for row in rows[1:]:
        c = cells(row, 'td')
        if len(c) > max(name_at, code_at) and re.fullmatch(r'[0-9A-Z]{6}', c[code_at]):
            items.append([c[code_at], c[name_at], mark])
    return items


def etf_list():
    data = json.loads(decode(get(ETF)))
    return [[e['itemcode'], e['itemname'].strip(), 'E'] for e in data['result']['etfItemList']]


def market_caps(codes):
    """
    네이버 시세에서 시가총액(현재가 × 상장 주식 수)을 받아요. 100종목씩 한 번에 (약 40번 요청).
    검색 결과를 큰 회사부터 보여주려고 쓰고, 파일에는 순서로만 남아요.
    """
    caps = {}
    for i in range(0, len(codes), 100):
        chunk = codes[i:i + 100]
        url = 'https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:' + ','.join(chunk)
        try:
            data = json.loads(decode(get(url)))
            for d in data['result']['areas'][0]['datas']:
                if d.get('nv') and d.get('countOfListedStock'):
                    caps[d['cd']] = d['nv'] * d['countOfListedStock']
        except Exception as e:  # 시가총액은 순서용이라 실패해도 목록은 만들어요
            print(f'시가총액 일부를 못 받았어요 ({i}~): {e}')
        time.sleep(0.2)  # 너무 빠르게 연달아 부르지 않게
    return caps


def write_list(path, items):
    """한 줄에 한 종목으로 저장 (git에서 바뀐 종목만 보이게)"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('{"updated": "%s", "items": [\n' % date.today().isoformat())
        f.write(',\n'.join(json.dumps(i, ensure_ascii=False) for i in items))
        f.write('\n]}\n')


def update_kr():
    kospi = kind_list('stockMkt', 'K')
    kosdaq = kind_list('kosdaqMkt', 'Q')
    etf = etf_list()
    # 너무 적으면 받는 곳 모양이 바뀐 거라서 기존 파일을 덮어쓰지 않아요
    if len(kospi) < 500 or len(kosdaq) < 1000 or len(etf) < 300:
        sys.exit(f'목록이 너무 적어요 (코스피 {len(kospi)}, 코스닥 {len(kosdaq)}, ETF {len(etf)}). 파일을 바꾸지 않았어요.')

    seen = set()
    items = []
    for item in kospi + kosdaq + etf:
        if item[0] not in seen:
            seen.add(item[0])
            items.append(item)

    # 시가총액 큰 순서로 (검색에서 같은 순위면 파일 앞쪽 = 큰 회사가 먼저 나와요)
    caps = market_caps([i[0] for i in items])
    items.sort(key=lambda i: -caps.get(i[0], 0))
    write_list(OUT, items)
    print(f'{OUT}: 코스피 {len(kospi)}, 코스닥 {len(kosdaq)}, ETF {len(etf)} → 모두 {len(items)}개')


# ---------- 미국 종목 (data/us-stocks.json) ----------

US_OUT = os.path.join(ROOT, 'data', 'us-stocks.json')
US_STOCKS = 3000      # 주식은 시가총액 큰 순서로 이만큼
US_ETFS = 300         # ETF는 거래대금 큰 순서로 이만큼
NAVER_US = 'https://api.stock.naver.com/stock/exchange/{}/marketValue?page={}&pageSize=100'
TV_SCAN = 'https://scanner.tradingview.com/america/scan'


def tv_scan(body):
    """트레이딩뷰 scanner (POST JSON) — 앱의 core/tradingview.js와 같은 주소"""
    req = urllib.request.Request(TV_SCAN, data=json.dumps(body).encode('utf-8'), headers=UA, method='POST')
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode('utf-8'))['data']


def naver_us(exchange, limit):
    """네이버 해외주식 목록 (시가총액 순): 코드, 한글 이름, 영문 이름, 시가총액"""
    rows = []
    page = 1
    while len(rows) < limit:
        data = json.loads(decode(get(NAVER_US.format(exchange, page))))
        stocks = data.get('stocks') or []
        if not stocks:
            break
        for s in stocks:
            cap = float(s.get('marketValueRaw') or 0)
            # 네이버는 'BRK B', 트레이딩뷰는 'BRK.B' (여러 종류 주식)
            rows.append([s['symbolCode'].replace(' ', '.'),(s.get('stockName') or '').strip(), (s.get('stockNameEng') or '').strip(), cap])
        page += 1
        time.sleep(0.2)
    return rows[:limit]


def update_us():
    stocks = naver_us('NASDAQ', US_STOCKS) + naver_us('NYSE', US_STOCKS) + naver_us('AMEX', 400)
    stocks.sort(key=lambda r: -r[3])
    stocks = stocks[:US_STOCKS]
    if len(stocks) < 1000:
        sys.exit(f'미국 종목이 너무 적어요 ({len(stocks)}). 파일을 바꾸지 않았어요.')

    # 트레이딩뷰 거래소 찾기 (네이버와 다를 때가 있어요. 예: ET는 네이버 AMEX인데 트레이딩뷰는 NYSE/AMEX 중 하나)
    where = {}
    symbols = [r[0] for r in stocks]
    for i in range(0, len(symbols), 300):
        chunk = symbols[i:i + 300]
        rows = tv_scan({'filter': [{'left': 'name', 'operation': 'in_range', 'right': chunk}],
                        'columns': ['name', 'exchange'], 'range': [0, 1000]})
        for row in rows:
            name, exchange = row['d']
            if exchange in ('NASDAQ', 'NYSE', 'AMEX') and name not in where:
                where[name] = exchange
        time.sleep(0.2)

    items = [[sym, ko, en, where[sym], 'S'] for sym, ko, en, _ in stocks if sym in where]

    # ETF: 트레이딩뷰에서 거래대금 큰 순서로 (네이버 목록에는 미국 ETF가 없어서 영문 이름만)
    etfs = tv_scan({'filter': [{'left': 'type', 'operation': 'equal', 'right': 'fund'},
                               {'left': 'subtype', 'operation': 'equal', 'right': 'etf'}],
                    'sort': {'sortBy': 'Value.Traded', 'sortOrder': 'desc'},
                    'columns': ['name', 'description', 'exchange'], 'range': [0, US_ETFS]})
    have = {i[0] for i in items}
    etf_items = [[d[0], '', d[1], d[2], 'E'] for d in (row['d'] for row in etfs) if d[0] not in have]
    items += etf_items

    write_list(US_OUT, items)
    print(f'{US_OUT}: 주식 {len(items) - len(etf_items)}, ETF {len(etf_items)} → 모두 {len(items)}개')


def main():
    """py tools/update-stocks.py        → 국내 + 미국
       py tools/update-stocks.py kr     → 국내만
       py tools/update-stocks.py us     → 미국만"""
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if which in ('all', 'kr'):
        update_kr()
    if which in ('all', 'us'):
        update_us()


if __name__ == '__main__':
    main()
