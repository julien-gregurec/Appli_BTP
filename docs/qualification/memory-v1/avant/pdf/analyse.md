| phase | durée s | RSS max | RSS fin | heapUsed max | heapTotal max | external max | arrayBuffers max | GC mineur n/ms | GC majeur n/ms | ELD p99 max ms | ELU moy | arbre RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| idle | 60 | 230 | 205 | 96 | 126 | 5 | 1 | 1/1 | 3/33 | 12 | 0.00 | 231 |
| load-1 | 91 | 338 | 323 | 131 | 157 | 30 | 26 | 93/584 | 29/253 | 303 | 0.12 | 681 |
| load-5 | 314 | 510 | 320 | 242 | 269 | 85 | 76 | 284/2943 | 15/381 | 124 | 0.12 | 2101 |
| load-10 | 361 | 510 | 368 | 203 | 231 | 104 | 100 | 264/3973 | 17/679 | 364 | 0.13 | 4137 |
| cool-T0 | 60 | 368 | 368 | 99 | 107 | 21 | 17 | 1/1 | 0/0 | 11 | 0.00 | 2209 |
| gc | 2 | 368 | 368 | 98 | 107 | 21 | 17 | 0/0 | 2/91 | 10 | 0.00 | - |

Points instantanés :
idle           rss=230 heapUsed=94 heapTotal=126 ext=5 ab=1 anon=151 file=79
load-1         rss=205 heapUsed=91 heapTotal=97 ext=5 ab=1 anon=127 file=79
end-load-1     rss=326 heapUsed=116 heapTotal=152 ext=20 ab=16 anon=246 file=80
load-5         rss=326 heapUsed=116 heapTotal=152 ext=20 ab=16 anon=246 file=80
end-load-5     rss=320 heapUsed=97 heapTotal=104 ext=7 ab=3 anon=240 file=80
load-10        rss=320 heapUsed=97 heapTotal=104 ext=7 ab=3 anon=240 file=80
end-load-10    rss=368 heapUsed=99 heapTotal=107 ext=21 ab=17 anon=288 file=80
cool-T0        rss=368 heapUsed=99 heapTotal=107 ext=21 ab=17 anon=288 file=80
gc             rss=368 heapUsed=99 heapTotal=107 ext=21 ab=17 anon=288 file=80
stop           rss=368 heapUsed=98 heapTotal=107 ext=21 ab=17 anon=288 file=80
before-gc      rss=368 heapUsed=99 heapTotal=107 ext=21 ab=17 anon=288 file=80
after-gc       rss=368 heapUsed=98 heapTotal=107 ext=21 ab=17 anon=288 file=80
