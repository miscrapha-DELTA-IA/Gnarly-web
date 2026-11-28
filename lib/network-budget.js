/** Limit optional network work, never explicit playback or downloads.
 * Network Information API estimates download, NOT Guardian upload speed.
 * Manual setting is needed on PCs with fast download but weak upload.
 */
export function conserveBackgroundTraffic(connection={},manual=false){
 if(manual===true||connection?.saveData===true)return true;
 if(/^(slow-2g|2g|3g)$/i.test(connection?.effectiveType||''))return true;
 const down=connection?.downlink,rtt=connection?.rtt;
 return (typeof down==='number'&&Number.isFinite(down)&&down>0&&down<=2)||
  (typeof rtt==='number'&&Number.isFinite(rtt)&&rtt>=400);
}
