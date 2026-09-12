import { mkdtemp, writeFile, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import type { Browser } from "@playwright/test";
export async function fixtures(browser: Browser) {
  const directory = await mkdtemp(join(tmpdir(), "studio-media-fixtures-"));
  for (let n = 0; n < 5; n++) {
    const img = sharp({
      create: {
        width: 160,
        height: 100,
        channels: 3,
        background: { r: 30 + n * 35, g: 140, b: 90 },
      },
    });
    await (n % 2 ? img.png() : img.jpeg()).toFile(
      join(directory, `photo-${n}.${n % 2 ? "png" : "jpg"}`),
    );
  }
  const page = await browser.newPage();
  await page.goto(process.env.NEXT_PUBLIC_STUDIO_URL! + "/login");
  // Synthetic WebCodecs frames; this muxer is a dev-only fixture tool, never imported by the application.
  await page.addScriptTag({
    path: resolve("node_modules/mp4-muxer/build/mp4-muxer.js"),
  });
  const video = await page.evaluate<number[]>(`(async()=>{
  const target=new Mp4Muxer.ArrayBufferTarget();const muxer=new Mp4Muxer.Muxer({target,video:{codec:'avc',width:160,height:100},fastStart:'in-memory'});
  let failure;const encoder=new VideoEncoder({output:(chunk,metadata)=>muxer.addVideoChunk(chunk,metadata),error:e=>failure=e});
  encoder.configure({codec:'avc1.42001f',width:160,height:100,bitrate:150000,framerate:10,avc:{format:'avc'}});
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;const ctx=canvas.getContext('2d');
  for(let i=0;i<20;i++){ctx.fillStyle=i%2?'#378a64':'#eee8d8';ctx.fillRect(0,0,160,100);ctx.fillStyle='#203428';ctx.fillRect(i*4,20,20,20);const frame=new VideoFrame(canvas,{timestamp:i*100000,duration:100000});encoder.encode(frame,{keyFrame:i===0});frame.close();}
  await encoder.flush();encoder.close();if(failure)throw failure;muxer.finalize();return Array.from(new Uint8Array(target.buffer));
 })()`);
  await page.close();
  const mp4 = Buffer.from(video);
  await writeFile(join(directory, "video-0.mp4"), mp4);
  await writeFile(join(directory, "video-1.mp4"), mp4);
  const mov = Buffer.from(mp4);
  mov.write("qt  ", 8, "ascii");
  await writeFile(join(directory, "video.mov"), mov);
  return { directory, mp4 };
}
export async function largeFixture(
  directory: string,
  mp4: Buffer,
  size = 1024 * 1024 * 1024,
) {
  const path = join(directory, "large.mp4");
  const file = await open(path, "w");
  await file.write(mp4);
  const free = Buffer.alloc(8);
  free.writeUInt32BE(size - mp4.length);
  free.write("free", 4);
  await file.write(free);
  await file.truncate(size);
  await file.close();
  return path;
}
