| phase | durée s | RSS max | RSS fin | heapUsed max | heapTotal max | external max | arrayBuffers max | GC mineur n/ms | GC majeur n/ms | ELD p99 max ms | ELU moy | arbre RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| idle | 60 | 235 | 204 | 92 | 131 | 5 | 1 | 1/1 | 3/32 | 14 | 0.01 | 235 |
| load-1 | 91 | 725 | 690 | 271 | 298 | 83 | 73 | 171/8346 | 15/385 | 614 | 0.22 | 738 |
| load-50 | 95 | 913 | 894 | 389 | 472 | 100 | 96 | 431/24069 | 15/703 | 1073 | 0.64 | 915 |
| cool-T0 | 60 | 894 | 552 | 293 | 397 | 85 | 81 | 0/0 | 2/283 | 107 | 0.01 | 895 |
| gc | 2 | 552 | 552 | 97 | 104 | 5 | 1 | 0/0 | 2/71 | 10 | 0.00 | 552 |

Points instantanés :
idle           rss=235 heapUsed=102 heapTotal=125 ext=5 ab=1 anon=156 file=79
snap-idle      rss=204 heapUsed=91 heapTotal=96 ext=5 ab=1 anon=126 file=79
load-1         rss=204 heapUsed=90 heapTotal=95 ext=5 ab=1 anon=126 file=79
end-load-1     rss=690 heapUsed=107 heapTotal=160 ext=22 ab=18 anon=611 file=80
load-50        rss=690 heapUsed=107 heapTotal=160 ext=22 ab=18 anon=611 file=80
end-load-50    rss=894 heapUsed=292 heapTotal=397 ext=85 ab=81 anon=815 file=80
cool-T0        rss=894 heapUsed=292 heapTotal=397 ext=85 ab=81 anon=815 file=80
gc             rss=552 heapUsed=97 heapTotal=104 ext=5 ab=1 anon=472 file=80
snap-end       rss=552 heapUsed=97 heapTotal=104 ext=5 ab=1 anon=472 file=80
stop           rss=552 heapUsed=97 heapTotal=104 ext=5 ab=1 anon=472 file=80
snap-idle      rss=204 heapUsed=90 heapTotal=95 ext=5 ab=1 anon=126 file=79
before-gc      rss=552 heapUsed=97 heapTotal=104 ext=5 ab=1 anon=472 file=80
after-gc       rss=552 heapUsed=97 heapTotal=104 ext=5 ab=1 anon=472 file=80
snap-end       rss=552 heapUsed=97 heapTotal=104 ext=5 ab=1 anon=472 file=80
