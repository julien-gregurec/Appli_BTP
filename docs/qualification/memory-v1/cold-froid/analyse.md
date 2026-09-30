| phase | durée s | RSS max | RSS fin | heapUsed max | heapTotal max | external max | arrayBuffers max | GC mineur n/ms | GC majeur n/ms | ELD p99 max ms | ELU moy | arbre RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| idle | 60 | 231 | 205 | 96 | 127 | 5 | 1 | 1/1 | 3/27 | 18 | 0.00 | 232 |
| load-50 | 97 | 1001 | 1001 | 518 | 562 | 120 | 116 | 435/27546 | 21/1003 | 1130 | 0.66 | 1002 |
| cool-T0 | 60 | 1001 | 708 | 518 | 562 | 120 | 116 | 1/1 | 2/415 | 36 | 0.01 | 1002 |
| gc | 2 | 708 | 708 | 228 | 288 | 21 | 17 | 0/0 | 2/245 | 10 | 0.00 | 709 |

Points instantanés :
idle           rss=230 heapUsed=94 heapTotal=127 ext=5 ab=1 anon=152 file=79
snap-idle      rss=205 heapUsed=91 heapTotal=97 ext=5 ab=1 anon=127 file=79
load-50        rss=205 heapUsed=90 heapTotal=96 ext=5 ab=1 anon=127 file=79
end-load-50    rss=1001 heapUsed=518 heapTotal=562 ext=120 ab=116 anon=922 file=80
cool-T0        rss=1001 heapUsed=518 heapTotal=562 ext=120 ab=116 anon=922 file=80
gc             rss=708 heapUsed=228 heapTotal=289 ext=21 ab=17 anon=629 file=80
snap-end       rss=708 heapUsed=228 heapTotal=288 ext=21 ab=17 anon=629 file=80
stop           rss=708 heapUsed=228 heapTotal=288 ext=21 ab=17 anon=629 file=80
snap-idle      rss=205 heapUsed=90 heapTotal=96 ext=5 ab=1 anon=127 file=79
before-gc      rss=708 heapUsed=228 heapTotal=289 ext=21 ab=17 anon=629 file=80
after-gc       rss=708 heapUsed=228 heapTotal=288 ext=21 ab=17 anon=629 file=80
snap-end       rss=708 heapUsed=228 heapTotal=288 ext=21 ab=17 anon=629 file=80
