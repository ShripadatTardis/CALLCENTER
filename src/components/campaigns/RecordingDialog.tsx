
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Play, Pause, Volume2, Download, Clock } from 'lucide-react';

interface RecordingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    name: string;
    mobileNumber: string;
    callTimestamp?: Date;
    callDuration?: number;
    recordingId?: string;
  } | null;
}

export const RecordingDialog: React.FC<RecordingDialogProps> = ({ open, onOpenChange, contact }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.7);

  if (!contact) return null;

  const totalDuration = contact.callDuration || 145; // seconds
  const progress = (currentTime / totalDuration) * 100;

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    // Mock playing functionality
    if (!isPlaying) {
      const interval = setInterval(() => {
        setCurrentTime(prev => {
          if (prev >= totalDuration) {
            setIsPlaying(false);
            clearInterval(interval);
            return totalDuration;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    setCurrentTime(Math.floor(percent * totalDuration));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Call Recording</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Call Details */}
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-medium">Customer:</span>
                  <div className="text-sm text-muted-foreground">{contact.name}</div>
                </div>
                <div>
                  <span className="font-medium">Phone:</span>
                  <div className="text-sm text-muted-foreground">{contact.mobileNumber}</div>
                </div>
                <div>
                  <span className="font-medium">Call Time:</span>
                  <div className="text-sm text-muted-foreground">
                    {contact.callTimestamp ? new Intl.DateTimeFormat('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }).format(contact.callTimestamp) : 'N/A'}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Duration:</span>
                  <div className="text-sm text-muted-foreground">{formatTime(totalDuration)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audio Player */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div 
                    className="w-full bg-gray-200 rounded-full h-2 cursor-pointer"
                    onClick={handleSeek}
                  >
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(totalDuration)}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center space-x-4">
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full w-12 h-12"
                    onClick={handlePlayPause}
                  >
                    {isPlaying ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5 ml-0.5" />
                    )}
                  </Button>
                </div>

                {/* Volume and Download */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-20"
                    />
                  </div>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recording Info */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Recording ID: {contact.recordingId}</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                This recording is stored securely and complies with data protection regulations.
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
