"""
로컬 개발용 간단 웹 서버  (실행: py serve.py  →  http://localhost:8000)

왜 필요한가요?
- JavaScript 모듈은 index.html을 더블클릭(file://)해서 열면 동작하지 않아서 웹 서버가 필요해요.
- 그런데 Windows에서 `py -m http.server`를 그대로 쓰면 .js 파일을 "text/plain"으로 보내는 경우가 있어서
  브라우저가 모듈 실행을 거부해요. 이 스크립트는 .js를 올바른 형식(text/javascript)으로 보내줘요.

2단계에서 Vite(개발 서버)를 도입하면 이 파일은 필요 없어져요.
"""
import http.server
import os

PORT = 8000

# 이 파일이 있는 폴더를 기준으로 파일을 보여줌
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
    }

    # 개발 중에는 항상 최신 파일을 받도록 캐시 끄기
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    print(f'http://localhost:{PORT} 에서 실행 중 (끝내려면 Ctrl+C)')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
