form Stock Praat offline baselines
 sentence Input
endform
Read from file: input$
sound = selected("Sound")
writeInfoLine: "method", tab$, "time", tab$, "hz"
for method from 1 to 2
 selectObject: sound
 if method = 1
  To Pitch (raw autocorrelation): 0, 75, 600, 15, "no", 0.03, 0.45, 0.01, 0.35, 0.14
 else
  To Pitch (filtered autocorrelation): 0, 50, 800, 15, "no", 0.03, 0.09, 0.50, 0.055, 0.35, 0.14
 endif
 pitch = selected("Pitch")
 frames = Get number of frames
 for frame from 1 to frames
  t = Get time from frame number: frame
  hz = Get value in frame: frame, "Hertz"
  appendInfoLine: method, tab$, t, tab$, hz
 endfor
 removeObject: pitch
endfor
removeObject: sound
