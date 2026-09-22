import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { NPSBadge } from './NPSBadge';
import { format } from 'date-fns';
import { 
  Play, 
  Pause, 
  Download, 
  Volume2, 
  Phone, 
  Clock, 
  User,
  SkipBack,
  SkipForward
} from 'lucide-react';

interface NPSRecordingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  response: any;
}

export const NPSRecordingDialog: React.FC<NPSRecordingDialogProps> = ({
  open,
  onOpenChange,
  response
}) => {
  console.log('NPSRecordingDialog render - open:', open, 'response:', response);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState([0.5]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const duration = response?.callDuration || 0;

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume[0];
    }
  }, [volume]);

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleSeek = (value: number[]) => {
    const time = value[0];
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleSkip = (seconds: number) => {
    if (audioRef.current) {
      const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    // In a real implementation, this would download the actual audio file
    const link = document.createElement('a');
    link.href = '#'; // This would be the actual recording URL
    link.download = `nps-recording-${response.name}-${format(response.responseTimestamp, 'yyyy-MM-dd')}.mp3`;
    link.click();
  };

  if (!response) {
    console.log('NPSRecordingDialog: No response provided, returning null');
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Phone className="h-5 w-5" />
              <span>NPS Survey Recording</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Call Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Survey Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">Participant:</span>
                  <span>{response.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Phone className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">Phone:</span>
                  <span>{response.mobileNumber}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">Duration:</span>
                  <span>{response.callDuration} seconds</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium">NPS Score:</span>
                  <NPSBadge score={response.npsScore} variant="compact" />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium">Date:</span>
                  <span>{format(response.responseTimestamp, 'PPp')}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium">Status:</span>
                  <Badge variant={response.escalated ? 'destructive' : 'default'}>
                    {response.escalated ? 'Escalated' : 'Completed'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audio Player */}
          <Card>
            <CardHeader>
              <CardTitle>Audio Player</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <Slider
                    value={[currentTime]}
                    max={duration}
                    step={1}
                    onValueChange={handleSeek}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center space-x-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSkip(-10)}
                  >
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  
                  <Button
                    variant="default"
                    size="lg"
                    onClick={handlePlayPause}
                    className="w-12 h-12 rounded-full"
                  >
                    {isPlaying ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5 ml-1" />
                    )}
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSkip(10)}
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>

                {/* Volume Control */}
                <div className="flex items-center space-x-3">
                  <Volume2 className="h-4 w-4 text-slate-500" />
                  <Slider
                    value={volume}
                    max={1}
                    step={0.1}
                    onValueChange={setVolume}
                    className="flex-1 max-w-[100px]"
                  />
                </div>

                {/* Hidden Audio Element */}
                <audio
                  ref={audioRef}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  onLoadedMetadata={() => {
                    if (audioRef.current) {
                      setCurrentTime(0);
                    }
                  }}
                >
                  {/* In a real implementation, this would be the actual audio source */}
                  <source src="#" type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            </CardContent>
          </Card>

          {/* Quick Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Survey Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">NPS Category:</span>
                  <span className="ml-2">{response.category.charAt(0).toUpperCase() + response.category.slice(1)}</span>
                </div>
                {response.feedback && (
                  <div>
                    <span className="font-medium">Customer Feedback:</span>
                    <div className="mt-1 p-2 bg-slate-50 rounded text-sm">
                      "{response.feedback}"
                    </div>
                  </div>
                )}
                <div>
                  <span className="font-medium">Quality Score:</span>
                  <span className="ml-2">
                    {response.npsScore >= 9 ? 'Excellent' : response.npsScore >= 7 ? 'Good' : 'Needs Improvement'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
