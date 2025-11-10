@echo off
setlocal enabledelayedexpansion
set count=1
for %%f in (*.jpg *.jpeg *.png *.gif *.bmp *.tiff) do (
  ren "%%f" "normal!count!.jpg"
  set /a count+=1
)
