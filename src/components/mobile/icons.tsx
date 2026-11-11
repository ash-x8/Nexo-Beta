"use client";
import React from "react";
import {
  Home,
  MessageSquare,
  Sparkles,
  Compass,
  Settings,
  Mic,
  Image as ImageIcon,
  FileText,
  ArrowLeft,
  MoreVertical,
  Plus,
  Search,
  Globe,
  ChevronRight,
  Send,
  Square,
  Volume2,
  VolumeX,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  Edit3,
  Sliders,
  Shield,
  Cpu,
  ExternalLink,
  User,
  LogOut,
  Info,
  Menu,
  X,
  UploadCloud,
  FileCode,
  Paperclip,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

export type IconName =
  | "home"
  | "chats"
  | "nexo"
  | "explore"
  | "settings"
  | "mic"
  | "image"
  | "doc"
  | "back"
  | "more"
  | "plus"
  | "search"
  | "globe"
  | "chevron"
  | "send"
  | "stop"
  | "speak"
  | "stopSpeak"
  | "copy"
  | "check"
  | "rotate"
  | "trash"
  | "edit"
  | "sliders"
  | "shield"
  | "cpu"
  | "link"
  | "user"
  | "logout"
  | "info"
  | "menu"
  | "close"
  | "upload"
  | "code"
  | "paperclip"
  | "success"
  | "alert";

interface Props {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 20, className = "" }: Props) {
  const iconProps = { size, className, strokeWidth: 1.8 };

  switch (name) {
    case "home":
      return <Home {...iconProps} />;
    case "chats":
      return <MessageSquare {...iconProps} />;
    case "nexo":
      return <Sparkles {...iconProps} />;
    case "explore":
      return <Compass {...iconProps} />;
    case "settings":
      return <Settings {...iconProps} />;
    case "mic":
      return <Mic {...iconProps} />;
    case "image":
      return <ImageIcon {...iconProps} />;
    case "doc":
      return <FileText {...iconProps} />;
    case "back":
      return <ArrowLeft {...iconProps} />;
    case "more":
      return <MoreVertical {...iconProps} />;
    case "plus":
      return <Plus {...iconProps} />;
    case "search":
      return <Search {...iconProps} />;
    case "globe":
      return <Globe {...iconProps} />;
    case "chevron":
      return <ChevronRight {...iconProps} />;
    case "send":
      return <Send {...iconProps} />;
    case "stop":
      return <Square {...iconProps} />;
    case "speak":
      return <Volume2 {...iconProps} />;
    case "stopSpeak":
      return <VolumeX {...iconProps} />;
    case "copy":
      return <Copy {...iconProps} />;
    case "check":
      return <Check {...iconProps} />;
    case "rotate":
      return <RotateCcw {...iconProps} />;
    case "trash":
      return <Trash2 {...iconProps} />;
    case "edit":
      return <Edit3 {...iconProps} />;
    case "sliders":
      return <Sliders {...iconProps} />;
    case "shield":
      return <Shield {...iconProps} />;
    case "cpu":
      return <Cpu {...iconProps} />;
    case "link":
      return <ExternalLink {...iconProps} />;
    case "user":
      return <User {...iconProps} />;
    case "logout":
      return <LogOut {...iconProps} />;
    case "info":
      return <Info {...iconProps} />;
    case "menu":
      return <Menu {...iconProps} />;
    case "close":
      return <X {...iconProps} />;
    case "upload":
      return <UploadCloud {...iconProps} />;
    case "code":
      return <FileCode {...iconProps} />;
    case "paperclip":
      return <Paperclip {...iconProps} />;
    case "success":
      return <CheckCircle2 {...iconProps} />;
    case "alert":
      return <AlertCircle {...iconProps} />;
    default:
      return <Sparkles {...iconProps} />;
  }
}
