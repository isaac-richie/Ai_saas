/**
 * The app's icons: Phosphor (MIT), drawn duotone by default, an outline plus a soft filled accent,
 * matching the editor's own glyphs. Names are the ones the app used with Lucide, so call sites read
 * the same; each maps to its closest Phosphor shape below.
 *
 * Lucide habits keep working: `fill="currentColor"` or the `fill-current` class draws the solid
 * weight, `fill="none"` draws the plain outline, and `strokeWidth` is ignored (Phosphor icons are
 * shapes, not strokes). Icons are hidden from screen readers unless given an aria-label.
 *
 * Built on the server-safe Phosphor entry, so these work in server and client components alike.
 */
import type { ComponentType, ReactElement, Ref, SVGProps } from "react"
import {
  Aperture as PhAperture, ArrowCounterClockwise as PhArrowCounterClockwise, ArrowDown as PhArrowDown, ArrowDownRight as PhArrowDownRight, ArrowLeft as PhArrowLeft, ArrowRight as PhArrowRight, ArrowSquareOut as PhArrowSquareOut, ArrowUUpLeft as PhArrowUUpLeft, ArrowUUpRight as PhArrowUUpRight, ArrowUp as PhArrowUp, ArrowUpRight as PhArrowUpRight, ArrowsClockwise as PhArrowsClockwise, ArrowsCounterClockwise as PhArrowsCounterClockwise, ArrowsLeftRight as PhArrowsLeftRight, ArrowsOut as PhArrowsOut, ArrowsOutCardinal as PhArrowsOutCardinal, Broadcast as PhBroadcast, Camera as PhCamera, CaretDown as PhCaretDown, CaretLeft as PhCaretLeft, CaretRight as PhCaretRight, CaretUp as PhCaretUp, ChatCenteredText as PhChatCenteredText, Check as PhCheck, CheckCircle as PhCheckCircle, CheckSquare as PhCheckSquare, Circle as PhCircle, CircleNotch as PhCircleNotch, Clock as PhClock, ClockCounterClockwise as PhClockCounterClockwise, CloudArrowDown as PhCloudArrowDown, CloudArrowUp as PhCloudArrowUp, Columns as PhColumns, Command as PhCommand, Copy as PhCopy, CopySimple as PhCopySimple, Cube as PhCube, DeviceMobile as PhDeviceMobile, DotsSixVertical as PhDotsSixVertical, DownloadSimple as PhDownloadSimple, Envelope as PhEnvelope, Eraser as PhEraser, Eye as PhEye, EyeSlash as PhEyeSlash, FilmSlate as PhFilmSlate, FilmStrip as PhFilmStrip, Flag as PhFlag, FloppyDisk as PhFloppyDisk, Folder as PhFolder, FolderOpen as PhFolderOpen, Gauge as PhGauge, GoogleChromeLogo as PhGoogleChromeLogo, GridNine as PhGridNine, Image as PhImage, ImageBroken as PhImageBroken, ImageSquare as PhImageSquare, Images as PhImages, Info as PhInfo, Intersect as PhIntersect, Kanban as PhKanban, Key as PhKey, Keyboard as PhKeyboard, Lightning as PhLightning, LinkBreak as PhLinkBreak, LinkSimple as PhLinkSimple, List as PhList, ListChecks as PhListChecks, ListPlus as PhListPlus, Lock as PhLock, LockKey as PhLockKey, LockOpen as PhLockOpen, MagicWand as PhMagicWand, MagnifyingGlass as PhMagnifyingGlass, MagnifyingGlassMinus as PhMagnifyingGlassMinus, MagnifyingGlassPlus as PhMagnifyingGlassPlus, Microphone as PhMicrophone, MusicNotes as PhMusicNotes, Note as PhNote, Package as PhPackage, Palette as PhPalette, PaperPlaneTilt as PhPaperPlaneTilt, Pause as PhPause, PencilSimple as PhPencilSimple, Play as PhPlay, PlayCircle as PhPlayCircle, Plus as PhPlus, PushPin as PhPushPin, Question as PhQuestion, Quotes as PhQuotes, Scissors as PhScissors, ShareNetwork as PhShareNetwork, ShieldCheck as PhShieldCheck, ShieldWarning as PhShieldWarning, SidebarSimple as PhSidebarSimple, SignOut as PhSignOut, SkipBack as PhSkipBack, SkipForward as PhSkipForward, SlidersHorizontal as PhSlidersHorizontal, Slideshow as PhSlideshow, Sparkle as PhSparkle, SpeakerHigh as PhSpeakerHigh, SpeakerSlash as PhSpeakerSlash, Square as PhSquare, SquaresFour as PhSquaresFour, Stack as PhStack, Star as PhStar, Sun as PhSun, TextT as PhTextT, Timer as PhTimer, Trash as PhTrash, Tray as PhTray, UploadSimple as PhUploadSimple, User as PhUser, UserCircle as PhUserCircle, Users as PhUsers, VideoCamera as PhVideoCamera, Warning as PhWarning, WarningCircle as PhWarningCircle, Waveform as PhWaveform, Waves as PhWaves, X as PhX,
} from "@phosphor-icons/react/dist/ssr"
import type { IconWeight } from "@phosphor-icons/react"

type PhosphorIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; weight?: IconWeight; mirrored?: boolean }>

export type AppIconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & {
  size?: number | string
  weight?: IconWeight
  mirrored?: boolean
  /** Accepted for Lucide compatibility and ignored. */
  strokeWidth?: number | string
  ref?: Ref<SVGSVGElement>
}
export type AppIcon = (props: AppIconProps) => ReactElement

/** The weight an icon is drawn in: duotone unless the call site asks for solid or plain. */
export function iconWeight({ weight, fill, className }: Pick<AppIconProps, "weight" | "fill" | "className">): IconWeight {
  if (weight) return weight
  if (fill === "currentColor" || /(^|\s)fill-current(\s|$)/.test(className ?? "")) return "fill"
  if (fill === "none") return "regular"
  return "duotone"
}

function icon(Ph: PhosphorIcon, name: string): AppIcon {
  const Icon = ({ size = 24, weight, fill, strokeWidth: _ignored, className, ...rest }: AppIconProps) => {
    void _ignored
    const labelled = Boolean(rest["aria-label"] || rest["aria-labelledby"])
    return <Ph size={size} weight={iconWeight({ weight, fill, className })} className={className} aria-hidden={labelled ? undefined : true} {...rest} />
  }
  Icon.displayName = name
  return Icon
}

export const AlertCircle = icon(PhWarningCircle, "AlertCircle")
export const AlertTriangle = icon(PhWarning, "AlertTriangle")
export const Aperture = icon(PhAperture, "Aperture")
export const ArrowDown = icon(PhArrowDown, "ArrowDown")
export const ArrowDownRight = icon(PhArrowDownRight, "ArrowDownRight")
export const ArrowLeft = icon(PhArrowLeft, "ArrowLeft")
export const ArrowRight = icon(PhArrowRight, "ArrowRight")
export const ArrowRightLeft = icon(PhArrowsLeftRight, "ArrowRightLeft")
export const ArrowUp = icon(PhArrowUp, "ArrowUp")
export const ArrowUpRight = icon(PhArrowUpRight, "ArrowUpRight")
export const AudioLines = icon(PhWaveform, "AudioLines")
export const AudioWaveform = icon(PhWaveform, "AudioWaveform")
export const Blend = icon(PhIntersect, "Blend")
export const Box = icon(PhCube, "Box")
export const Camera = icon(PhCamera, "Camera")
export const Check = icon(PhCheck, "Check")
export const CheckCircle2 = icon(PhCheckCircle, "CheckCircle2")
export const CheckIcon = icon(PhCheck, "CheckIcon")
export const CheckSquare = icon(PhCheckSquare, "CheckSquare")
export const ChevronDown = icon(PhCaretDown, "ChevronDown")
export const ChevronDownIcon = icon(PhCaretDown, "ChevronDownIcon")
export const ChevronLeft = icon(PhCaretLeft, "ChevronLeft")
export const ChevronRight = icon(PhCaretRight, "ChevronRight")
export const ChevronUpIcon = icon(PhCaretUp, "ChevronUpIcon")
export const Chrome = icon(PhGoogleChromeLogo, "Chrome")
export const Circle = icon(PhCircle, "Circle")
export const Clapperboard = icon(PhFilmSlate, "Clapperboard")
export const Clock = icon(PhClock, "Clock")
export const Clock4 = icon(PhClock, "Clock4")
export const CloudDownload = icon(PhCloudArrowDown, "CloudDownload")
export const CloudUpload = icon(PhCloudArrowUp, "CloudUpload")
export const Columns2 = icon(PhColumns, "Columns2")
export const Command = icon(PhCommand, "Command")
export const Copy = icon(PhCopy, "Copy")
export const CopyPlus = icon(PhCopySimple, "CopyPlus")
export const Download = icon(PhDownloadSimple, "Download")
export const Eraser = icon(PhEraser, "Eraser")
export const ExternalLink = icon(PhArrowSquareOut, "ExternalLink")
export const Eye = icon(PhEye, "Eye")
export const EyeOff = icon(PhEyeSlash, "EyeOff")
export const Film = icon(PhFilmStrip, "Film")
export const Flag = icon(PhFlag, "Flag")
export const Folder = icon(PhFolder, "Folder")
export const FolderInput = icon(PhFolderOpen, "FolderInput")
export const FolderKanban = icon(PhKanban, "FolderKanban")
export const GalleryHorizontalEnd = icon(PhSlideshow, "GalleryHorizontalEnd")
export const Gauge = icon(PhGauge, "Gauge")
export const Grid3x3 = icon(PhGridNine, "Grid3x3")
export const GripVertical = icon(PhDotsSixVertical, "GripVertical")
export const HelpCircle = icon(PhQuestion, "HelpCircle")
export const History = icon(PhClockCounterClockwise, "History")
export const ImageIcon = icon(PhImage, "ImageIcon")
export const ImageOff = icon(PhImageBroken, "ImageOff")
export const ImagePlus = icon(PhImageSquare, "ImagePlus")
export const Images = icon(PhImages, "Images")
export const Inbox = icon(PhTray, "Inbox")
export const Info = icon(PhInfo, "Info")
export const KeyRound = icon(PhKey, "KeyRound")
export const Keyboard = icon(PhKeyboard, "Keyboard")
export const Layers = icon(PhStack, "Layers")
export const LayoutGrid = icon(PhSquaresFour, "LayoutGrid")
export const Link2 = icon(PhLinkSimple, "Link2")
export const Link2Off = icon(PhLinkBreak, "Link2Off")
export const ListChecks = icon(PhListChecks, "ListChecks")
export const ListPlus = icon(PhListPlus, "ListPlus")
export const Loader2 = icon(PhCircleNotch, "Loader2")
export const Lock = icon(PhLock, "Lock")
export const LockKeyhole = icon(PhLockKey, "LockKeyhole")
export const LogOut = icon(PhSignOut, "LogOut")
export const Mail = icon(PhEnvelope, "Mail")
export const Maximize = icon(PhArrowsOut, "Maximize")
export const Maximize2 = icon(PhArrowsOut, "Maximize2")
export const Menu = icon(PhList, "Menu")
export const MessageSquare = icon(PhChatCenteredText, "MessageSquare")
export const MessageSquareQuote = icon(PhQuotes, "MessageSquareQuote")
export const Mic = icon(PhMicrophone, "Mic")
export const Move3d = icon(PhArrowsOutCardinal, "Move3d")
export const Music2 = icon(PhMusicNotes, "Music2")
export const Package = icon(PhPackage, "Package")
export const Palette = icon(PhPalette, "Palette")
export const PanelLeftClose = icon(PhSidebarSimple, "PanelLeftClose")
export const PanelLeftOpen = icon(PhSidebarSimple, "PanelLeftOpen")
export const Pause = icon(PhPause, "Pause")
export const Pencil = icon(PhPencilSimple, "Pencil")
export const Pin = icon(PhPushPin, "Pin")
export const Play = icon(PhPlay, "Play")
export const PlayCircle = icon(PhPlayCircle, "PlayCircle")
export const Plus = icon(PhPlus, "Plus")
export const RadioTower = icon(PhBroadcast, "RadioTower")
export const Redo2 = icon(PhArrowUUpRight, "Redo2")
export const RefreshCcw = icon(PhArrowsCounterClockwise, "RefreshCcw")
export const RefreshCw = icon(PhArrowsClockwise, "RefreshCw")
export const RotateCcw = icon(PhArrowCounterClockwise, "RotateCcw")
export const Save = icon(PhFloppyDisk, "Save")
export const Scissors = icon(PhScissors, "Scissors")
export const Search = icon(PhMagnifyingGlass, "Search")
export const Send = icon(PhPaperPlaneTilt, "Send")
export const Share2 = icon(PhShareNetwork, "Share2")
export const ShieldAlert = icon(PhShieldWarning, "ShieldAlert")
export const ShieldCheck = icon(PhShieldCheck, "ShieldCheck")
export const SkipBack = icon(PhSkipBack, "SkipBack")
export const SkipForward = icon(PhSkipForward, "SkipForward")
export const SlidersHorizontal = icon(PhSlidersHorizontal, "SlidersHorizontal")
export const Smartphone = icon(PhDeviceMobile, "Smartphone")
export const Sparkles = icon(PhSparkle, "Sparkles")
export const Square = icon(PhSquare, "Square")
export const Star = icon(PhStar, "Star")
export const StickyNote = icon(PhNote, "StickyNote")
export const Sun = icon(PhSun, "Sun")
export const Timer = icon(PhTimer, "Timer")
export const Trash = icon(PhTrash, "Trash")
export const Trash2 = icon(PhTrash, "Trash2")
export const Type = icon(PhTextT, "Type")
export const Undo2 = icon(PhArrowUUpLeft, "Undo2")
export const Unlock = icon(PhLockOpen, "Unlock")
export const Upload = icon(PhUploadSimple, "Upload")
export const UploadCloud = icon(PhCloudArrowUp, "UploadCloud")
export const User = icon(PhUser, "User")
export const UserRound = icon(PhUserCircle, "UserRound")
export const Users = icon(PhUsers, "Users")
export const Video = icon(PhVideoCamera, "Video")
export const Volume2 = icon(PhSpeakerHigh, "Volume2")
export const VolumeX = icon(PhSpeakerSlash, "VolumeX")
export const Wand2 = icon(PhMagicWand, "Wand2")
export const WandSparkles = icon(PhMagicWand, "WandSparkles")
export const Waves = icon(PhWaves, "Waves")
export const X = icon(PhX, "X")
export const XIcon = icon(PhX, "XIcon")
export const Zap = icon(PhLightning, "Zap")
export const ZoomIn = icon(PhMagnifyingGlassPlus, "ZoomIn")
export const ZoomOut = icon(PhMagnifyingGlassMinus, "ZoomOut")
