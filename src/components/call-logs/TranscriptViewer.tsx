
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Play, Pause, SkipBack, SkipForward, Download, BookmarkIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface TranscriptEntry {
  timestamp: string;
  speaker: 'customer' | 'ai' | 'agent';
  text: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  confidence?: number;
}

interface TranscriptViewerProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string;
  transcript: TranscriptEntry[];
  duration: number;
}

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({
  isOpen,
  onClose,
  callId,
  transcript,
  duration
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const filteredTranscript = transcript.filter(entry =>
    entry.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSpeakerColor = (speaker: string) => {
    switch (speaker) {
      case 'customer': return 'bg-blue-100 text-blue-800';
      case 'ai': return 'bg-green-100 text-green-800';
      case 'agent': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600';
      case 'negative': return 'text-red-600';
      case 'neutral': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Call Transcript - {callId}</span>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                <BookmarkIcon className="h-4 w-4 mr-1" />
                Bookmark
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Audio Controls */}
        <div className="bg-slate-50 p-4 rounded-lg">
          <div className="flex items-center space-x-4 mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm">
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <SkipForward className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <Progress value={(currentTime / duration) * 100} className="h-2" />
            </div>
            <div className="text-sm text-slate-600">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              className="text-sm border rounded px-2 py-1"
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
          <Input
            placeholder="Search transcript..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-auto space-y-3">
          {filteredTranscript.map((entry, index) => (
            <div key={index} className="border-l-4 border-slate-200 pl-4 py-2">
              <div className="flex items-center space-x-2 mb-2">
                <Badge className={getSpeakerColor(entry.speaker)}>
                  {entry.speaker.toUpperCase()}
                </Badge>
                <span className="text-sm text-slate-500">{entry.timestamp}</span>
                {entry.sentiment && (
                  <span className={`text-xs ${getSentimentColor(entry.sentiment)}`}>
                    {entry.sentiment}
                  </span>
                )}
                {entry.confidence && (
                  <span className="text-xs text-slate-400">
                    {(entry.confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>
              <p className="text-slate-800 leading-relaxed">
                {searchTerm ? (
                  entry.text.split(new RegExp(`(${searchTerm})`, 'gi')).map((part, i) =>
                    part.toLowerCase() === searchTerm.toLowerCase() ? (
                      <mark key={i} className="bg-yellow-200">{part}</mark>
                    ) : part
                  )
                ) : (
                  entry.text
                )}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
