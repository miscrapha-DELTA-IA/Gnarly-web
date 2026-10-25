"""Local browser smoke for Stage72 visual taxonomy and real four-source StemMixer.
Uses synthetic WAV; no claims of cloud neural separation or real YouTube extraction.
"""
from pathlib import Path
import base64, re, io, wave, math, struct
from playwright.sync_api import sync_playwright

def wav_bytes():
    buf=io.BytesIO();rate=16000
    with wave.open(buf,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate)
        samples=[int(math.sin(2*math.pi*440*i/rate)*3500) for i in range(rate*5)]
        w.writeframes(struct.pack('<%dh'%len(samples),*samples))
    return buf.getvalue()

def bundle_file(root,path):
    js=(root/path).read_text()
    for _,spec in re.findall(r"from (['\"])(\.\.?/[^'\"]+)\1",js):
        dependency=(Path(path).parent/spec).as_posix()
        js=js.replace(spec,bundle_file(root,dependency))
    return 'data:text/javascript;base64,'+base64.b64encode(js.encode()).decode()

root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required','--enable-webgl','--use-gl=angle','--use-angle=swiftshader'])
    page=browser.new_page(viewport={'width':390,'height':844},reduced_motion='no-preference');errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://lrclib.net/**',lambda route:route.fulfill(status=404,body=''))
    html=(root/'index.html').read_text().replace('<script type="module" src="./app.js"></script>','').replace('<link rel="stylesheet" href="./styles.css" />','<style>'+ (root/'styles.css').read_text()+'</style>')
    page.set_content(html)
    script=(root/'app.js').read_text()
    for match in re.findall(r"from ['\"](\./lib/[^'\"]+)['\"]",script):
        script=script.replace(match,bundle_file(root,match[2:]))
    page.add_script_tag(type='module',content=script)
    page.wait_for_timeout(450)
    page.locator('#theme-button').click()
    page.locator('button[data-visual-tab="experience"]').click()
    page.locator('button[data-experience="cyber-night"]').click()
    assert page.locator('.visual-status small').inner_text().startswith('Experiência: Cyber Night')
    page.locator('button[data-visual-tab="theme"]').click()
    page.locator('button[data-theme="GNARLY"]').click()
    assert 'Modo GNARLY ativo' in page.locator('.visual-status').inner_text()
    page.locator('[data-command="restore-theme"]').click()
    assert 'ACID' in page.locator('.visual-status strong').inner_text()
    assert 'Cyber Night' in page.locator('.visual-status small').inner_text()
    page.locator('#close-sheet').click()
    page.locator('#audio-import').set_input_files({'name':'Demo - Song.wav','mimeType':'audio/wav','buffer':wav_bytes()})
    page.wait_for_timeout(250)
    page.locator('#controls-button').click()
    page.locator('[data-command="go-stems"]').click()
    assert page.locator('#stem-status').is_visible()
    stems=[{'name':n+'.wav','mimeType':'audio/wav','buffer':wav_bytes()} for n in ['vocals','drums','bass','other']]
    page.locator('#stems-import').set_input_files(stems)
    page.wait_for_timeout(600)
    status=page.locator('#stem-status').inner_text()
    assert 'Quatro fontes reais' in status, status
    page.locator('[data-stem-preset="karaoke"]').click()
    assert page.locator('#stem-vocal-value').inner_text()=='0%'
    assert page.locator('#stem-bass-value').inner_text()=='100%'
    page.locator('#close-sheet').click()
    page.locator('#play-button').click()
    page.wait_for_timeout(450)
    assert page.eval_on_selector('#player-audio','el=>el.currentTime')>0
    page.locator('#controls-button').click()
    page.locator('[data-command="go-stems"]').click()
    page.screenshot(path='/mnt/data/GNARLY_WEB_ALPHA6_STEMS_MOBILE.png',full_page=True)
    print('VISUAL+STEMS SMOKE OK; WebGL:',page.eval_on_selector('#fluid-canvas','el=>!!el.getContext("webgl2")'),'audio:',page.eval_on_selector('#player-audio','el=>el.currentTime'),'errors:',errors)
    assert not errors,errors
    browser.close()
