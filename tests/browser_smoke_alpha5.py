"""Local UI-level smoke: direct source, no beta login/YouTube overlay.
Run: python tests/browser_smoke_alpha5.py (requires local Chromium/Playwright)
Uses synthetic WAV response for the remote Render request; not a live extract.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import base64, re, io, wave, math, struct

def wav_bytes():
    buf=io.BytesIO()
    with wave.open(buf,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(22050)
        samples=[int(math.sin(2*math.pi*440*i/22050)*5000) for i in range(22050*3)]
        w.writeframes(struct.pack('<%dh' % len(samples), *samples))
    return buf.getvalue()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':390,'height':844})
    captured=[];errs=[]
    page.on('console',lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
    page.on('pageerror',lambda e: errs.append('page:'+str(e)))
    page.route('https://nightcorelab.onrender.com/download**',lambda route:(captured.append(route.request.url),route.fulfill(status=200,headers={'content-type':'audio/wav','access-control-allow-origin':'*','accept-ranges':'bytes'},body=wav_bytes())))
    page.route('https://lrclib.net/**',lambda route:route.fulfill(status=404,body=''))
    root=Path(__file__).resolve().parents[1]
    html=(root/'index.html').read_text().replace('<script type="module" src="./app.js"></script>', '')
    html=html.replace('<link rel="stylesheet" href="./styles.css" />','<style>'+ (root/'styles.css').read_text()+'</style>')
    page.set_content(html)
    def bundle_file(path):
        js=(root/path).read_text()
        for _,spec in re.findall(r"from (['\"])(\.\.?/[^'\"]+)\1",js):
            dep=(Path(path).parent/spec).as_posix()
            importurl=bundle_file(dep)
            js=js.replace(spec,importurl)
        return 'data:text/javascript;base64,'+base64.b64encode(js.encode()).decode()
    source=(root/'app.js').read_text()
    for name in re.findall(r"from ['\"](\./lib/[^'\"]+)['\"]",source):
        source=source.replace(name,bundle_file(name[2:]))
    page.add_script_tag(type='module',content=source)
    page.wait_for_timeout(500)
    page.locator('#search-toggle').click()
    page.locator('#search-term').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    page.locator('#search-form button[type="submit"]').click()
    page.locator('#close-sheet').click()
    page.locator('#play-button').click()
    page.wait_for_timeout(1000)
    assert captured, 'backend direct request not sent'
    assert 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' == __import__('urllib.parse',fromlist=['parse_qs']).parse_qs(__import__('urllib.parse',fromlist=['urlparse']).urlparse(captured[0]).query)['url'][0],captured
    assert page.locator('#youtube-player-dialog').is_hidden(), 'YouTube player modal unexpectedly open'
    assert page.locator('#play-button').get_attribute('aria-label')=='Pausar', page.locator('#player-status').inner_text()
    page.locator('button[data-preset="NIGHTCORE"]').click()
    assert page.locator('button[data-preset="NIGHTCORE"]').get_attribute('aria-pressed')=='true'
    page.screenshot(path='/mnt/data/gnarlyweb_alpha5_smoke_mobile.png',full_page=True)
    print('Browser smoke OK:',len(captured),'remote requests; audio time:',page.eval_on_selector('#player-audio','el=>el.currentTime'),'errors:',errs[:5]);browser.close()
