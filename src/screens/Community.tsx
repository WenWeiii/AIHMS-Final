import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { Heart, MessageCircle, Share2, Bookmark, ChevronRight, ChevronLeft, Leaf, Trees, Droplets, Star, MoreHorizontal, Users, MapPin, Calendar, Plus, X, Search, Check, Quote, UserPlus, UserCheck, LayoutGrid, ListFilter, Trophy, Target, ShieldAlert, AlertCircle, Trash2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useFirebase } from '../components/FirebaseProvider';
import { useTranslation } from '../components/LanguageProvider';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, limit, updateDoc, doc, increment, deleteDoc, getDoc, setDoc, writeBatch, where, getDocs } from 'firebase/firestore';
import { AnimatePresence } from 'motion/react';

import { ChatInterface } from '../components/ChatInterface';

interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  circleId?: string;
  type: 'event' | 'tip' | 'milestone';
  title: string;
  content: string;
  timestamp: string;
  likes: number;
  commentsCount?: number;
  bookmarksCount?: number;
  attendees?: number;
  location?: string;
  eventDate?: string;
  hasLiked?: boolean;
}

interface Circle {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  createdBy: string;
  icon: string;
  tasks?: { id: string; title: string; completed: boolean; points: number }[];
}

interface ProfileData {
  uid: string;
  displayName: string;
  photoURL: string;
  role: string;
  bio?: string;
  followingCount: number;
  followersCount: number;
  posts: CommunityPost[];
}

export const Community: React.FC = () => {
  const { user, profile } = useFirebase();
  const { t, language } = useTranslation();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [userRSVPs, setUserRSVPs] = useState<Set<string>>(new Set());
  const [userCircles, setUserCircles] = useState<Set<string>>(new Set());
  const [userBookmarks, setUserBookmarks] = useState<Set<string>>(new Set());
  const [userFollowing, setUserFollowing] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showCreateCircle, setShowCreateCircle] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showPostOptions, setShowPostOptions] = useState<string | null>(null);
  const [showComments, setShowComments] = useState<string | null>(null);
  const [postComments, setPostComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [recommendedUsers, setRecommendedUsers] = useState<any[]>([]);
  const [editProfileData, setEditProfileData] = useState({ displayName: '', photoURL: '', bio: '' });
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFollowingOnly, setShowFollowingOnly] = useState(false);
  const [followList, setFollowList] = useState<{ type: 'followers' | 'following', users: any[] } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeChatRecipient, setActiveChatRecipient] = useState<any | null>(null);
  const [newPost, setNewPost] = useState<Partial<CommunityPost>>({
    type: 'tip',
    title: '',
    content: '',
    location: '',
    eventDate: '',
    circleId: ''
  });
  const [newCircle, setNewCircle] = useState({ name: '', description: '', icon: 'Leaf' });
  const recommendedRef = useRef<HTMLDivElement>(null);

  const scrollRecommended = (direction: 'left' | 'right') => {
    if (recommendedRef.current) {
      const scrollAmount = 300;
      recommendedRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    if (!user) return;

    // Fetch user-specific data (likes, rsvps, circles, following, bookmarks)
    const unsubscribes: (() => void)[] = [];

    const likesPath = `users/${user.uid}/likes`;
    unsubscribes.push(onSnapshot(collection(db, likesPath), (snapshot) => {
      const likedPostIds = new Set(snapshot.docs.map(doc => doc.data().postId));
      setUserLikes(likedPostIds);
    }));

    const rsvpsPath = `users/${user.uid}/rsvps`;
    unsubscribes.push(onSnapshot(collection(db, rsvpsPath), (snapshot) => {
      const rsvpPostIds = new Set(snapshot.docs.map(doc => doc.data().postId));
      setUserRSVPs(rsvpPostIds);
    }));

    const joinedCirclesPath = `users/${user.uid}/joinedCircles`;
    unsubscribes.push(onSnapshot(collection(db, joinedCirclesPath), (snapshot) => {
      const circleIds = new Set(snapshot.docs.map(doc => doc.data().circleId));
      setUserCircles(circleIds);
    }));

    const followingPath = `users/${user.uid}/following`;
    unsubscribes.push(onSnapshot(collection(db, followingPath), (snapshot) => {
      const followingIds = new Set(snapshot.docs.map(doc => doc.data().followingId));
      setUserFollowing(followingIds);
    }));

    const bookmarksPath = `users/${user.uid}/bookmarks`;
    unsubscribes.push(onSnapshot(collection(db, bookmarksPath), (snapshot) => {
      const bookmarkIds = new Set(snapshot.docs.map(doc => doc.data().postId));
      setUserBookmarks(bookmarkIds);
    }));

    const circlesPath = 'circles';
    unsubscribes.push(onSnapshot(collection(db, circlesPath), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Circle[];
      setCircles(data);
    }));

    const fetchRecommended = async () => {
      try {
        const usersSnap = await getDocs(query(collection(db, 'users'), limit(10)));
        const filtered = usersSnap.docs
          .map(doc => ({ uid: doc.id, ...doc.data() }))
          .filter(u => u.uid !== user.uid);
        setRecommendedUsers(filtered);
      } catch (error) {
        console.error("Error fetching recommended users:", error);
      }
    };
    fetchRecommended();

    return () => unsubscribes.forEach(unsub => unsub());
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Fetch all posts - we filter locally to avoid indexing issues in preview
    const postsPath = 'communityPosts';
    const q = query(collection(db, postsPath), orderBy('timestamp', 'desc'), limit(100));

    const unsubscribePosts = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CommunityPost[];
      setPosts(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, postsPath);
    });

    return () => unsubscribePosts();
  }, [user]);

  // Fetch comments when drawer opens
  useEffect(() => {
    if (!showComments) {
      setPostComments([]);
      return;
    }

    const commentsPath = `communityPosts/${showComments}/comments`;
    const q = query(collection(db, commentsPath), orderBy('timestamp', 'asc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPostComments(data);
    });

    return () => unsubscribe();
  }, [showComments]);

  // Dedicated effect for profile modal data
  useEffect(() => {
    if (!selectedProfileId) {
      setSelectedProfile(null);
      return;
    }

    // Fetch user basic info
    const userRef = doc(db, 'users', selectedProfileId);
    const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data();
        setSelectedProfile(prev => ({
          uid: selectedProfileId,
          displayName: userData.displayName || t('common.anonymous'),
          photoURL: userData.photoURL || '',
          role: userData.role || 'patient',
          followingCount: userData.followingCount || 0,
          followersCount: userData.followerCount || 0,
          posts: prev?.posts || []
        }));
      }
    });

    // Fetch user's posts
    const postsQuery = query(
      collection(db, 'communityPosts'), 
      where('authorId', '==', selectedProfileId), 
      orderBy('timestamp', 'desc'), 
      limit(10)
    );
    const unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
      const userPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as CommunityPost[];
      setSelectedProfile(prev => prev ? { ...prev, posts: userPosts } : null);
    });

    return () => {
      unsubscribeUser();
      unsubscribePosts();
    };
  }, [selectedProfileId]);

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: editProfileData.displayName,
        photoURL: editProfileData.photoURL,
        bio: editProfileData.bio
      });
      setShowEditProfile(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLike = async (postId: string) => {
    if (!user) return;

    const hasLiked = userLikes.has(postId);
    const batch = writeBatch(db);
    const postRef = doc(db, 'communityPosts', postId);
    const likeRef = doc(db, `users/${user.uid}/likes`, postId);

    try {
      if (hasLiked) {
        // Unlike
        batch.update(postRef, { likes: increment(-1) });
        batch.delete(likeRef);
      } else {
        // Like
        batch.update(postRef, { likes: increment(1) });
        batch.set(likeRef, { postId, timestamp: serverTimestamp() });
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communityPosts/${postId}`);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!user) return;

    try {
      await deleteDoc(doc(db, 'communityPosts', postId));
      setShowDeleteConfirm(null);
      setShowPostOptions(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `communityPosts/${postId}`);
    }
  };

  const handleShare = async (postId: string) => {
    const url = `${window.location.origin}/community?post=${postId}`;
    const shareData = {
      title: 'AIHMs Community Post',
      text: 'Check out this post from the AIHMs community',
      url: url,
    };

    if (navigator.share && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // Handle case where user cancels the share
        console.error('Error sharing:', err);
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(url);
      setCopiedId(postId);
      setTimeout(() => setCopiedId(null), 2000);
    }
    setShowPostOptions(null);
  };

  const handleBookmark = async (postId: string) => {
    if (!user) return;
    const isBookmarked = userBookmarks.has(postId);
    const bookmarkRef = doc(db, `users/${user.uid}/bookmarks`, postId);
    const postRef = doc(db, 'communityPosts', postId);
    
    try {
      const batch = writeBatch(db);
      if (isBookmarked) {
        batch.delete(bookmarkRef);
        batch.update(postRef, { bookmarksCount: increment(-1) });
      } else {
        batch.set(bookmarkRef, { postId, timestamp: serverTimestamp() });
        batch.update(postRef, { bookmarksCount: increment(1) });
      }
      await batch.commit();
      setShowPostOptions(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communityPosts/${postId}`);
    }
  };

  const handleAddComment = async () => {
    if (!user || !showComments || !commentText.trim()) return;
    setIsSubmitting(true);
    const path = `communityPosts/${showComments}/comments`;
    const postRef = doc(db, 'communityPosts', showComments);
    try {
      const batch = writeBatch(db);
      const newCommentRef = doc(collection(db, path));
      batch.set(newCommentRef, {
        authorId: user.uid,
        authorName: user.displayName || t('common.anonymous'),
        authorPhoto: user.photoURL || '',
        text: commentText,
        timestamp: new Date().toISOString()
      });
      batch.update(postRef, {
        commentsCount: increment(1)
      });
      await batch.commit();
      setCommentText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRSVP = async (post: CommunityPost) => {
    if (!user) return;

    const hasRSVPed = userRSVPs.has(post.id);
    const batch = writeBatch(db);
    const postRef = doc(db, 'communityPosts', post.id);
    const rsvpRef = doc(db, `users/${user.uid}/rsvps`, post.id);

    try {
      if (hasRSVPed) {
        // Cancel RSVP
        batch.update(postRef, { attendees: increment(-1) });
        batch.delete(rsvpRef);
      } else {
        // RSVP
        batch.update(postRef, { attendees: increment(1) });
        batch.set(rsvpRef, { 
          postId: post.id, 
          timestamp: serverTimestamp(),
          eventTitle: post.title,
          eventDate: post.eventDate
        });

        // Add to user's calendar
        const calendarPath = `users/${user.uid}/appointments`;
        await addDoc(collection(db, calendarPath), {
          userId: user.uid,
          title: t('community.event_calendar_title').replace('{title}', post.title),
          date: post.eventDate,
          time: "10:00", // Default time
          type: 'other',
          notes: t('community.event_calendar_notes')
            .replace('{location}', post.location || '')
            .replace('{content}', post.content),
          status: 'scheduled',
          reminderEnabled: true
        });
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communityPosts/${post.id}`);
    }
  };

  const handleCreatePost = async () => {
    if (!user || !newPost.title || !newPost.content) return;
    setIsSubmitting(true);

    const path = 'communityPosts';
    try {
      await addDoc(collection(db, path), {
        ...newPost,
        authorId: user.uid,
        authorName: user.displayName || t('common.anonymous'),
        authorPhoto: user.photoURL || '',
        timestamp: new Date().toISOString(),
        likes: 0,
        attendees: 0,
        createdAt: serverTimestamp()
      });
      setShowAdd(false);
      setNewPost({ type: 'tip', title: '', content: '', location: '', eventDate: '', circleId: selectedCircleId || '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCircle = async () => {
    if (!user || !newCircle.name) return;
    setIsSubmitting(true);
    try {
      const circleRef = await addDoc(collection(db, 'circles'), {
        ...newCircle,
        memberCount: 1,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        tasks: [
          { id: '1', title: t('community.task_morning_walk'), completed: false, points: 10 },
          { id: '2', title: t('community.task_recipe_share'), completed: false, points: 15 },
          { id: '3', title: t('community.task_group_chat'), completed: false, points: 20 }
        ]
      });
      
      // Auto join
      await setDoc(doc(db, `users/${user.uid}/joinedCircles`, circleRef.id), {
        circleId: circleRef.id,
        joinedAt: serverTimestamp()
      });
      
      setShowCreateCircle(false);
      setNewCircle({ name: '', description: '', icon: 'Leaf' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'circles');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinCircle = async (circleId: string) => {
    if (!user) return;
    const isJoined = userCircles.has(circleId);
    const batch = writeBatch(db);
    const circleRef = doc(db, 'circles', circleId);
    const userCircleRef = doc(db, `users/${user.uid}/joinedCircles`, circleId);

    try {
      if (isJoined) {
        batch.update(circleRef, { memberCount: increment(-1) });
        batch.delete(userCircleRef);
      } else {
        batch.update(circleRef, { memberCount: increment(1) });
        batch.set(userCircleRef, { circleId, joinedAt: serverTimestamp() });
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `circles/${circleId}`);
    }
  };

  const handleFollowUser = async (targetUserId: string) => {
    if (!user || user.uid === targetUserId) return;
    const isFollowing = userFollowing.has(targetUserId);
    const batch = writeBatch(db);
    const followingRef = doc(db, `users/${user.uid}/following`, targetUserId);
    const followersRef = doc(db, `users/${targetUserId}/followers`, user.uid);
    const userRef = doc(db, 'users', user.uid);
    const targetRef = doc(db, 'users', targetUserId);

    try {
      if (isFollowing) {
        batch.delete(followingRef);
        batch.delete(followersRef);
        batch.update(userRef, { followingCount: increment(-1) });
        batch.update(targetRef, { followerCount: increment(-1) });
      } else {
        batch.set(followingRef, { followingId: targetUserId, timestamp: serverTimestamp() });
        batch.set(followersRef, { followerId: user.uid, timestamp: serverTimestamp() });
        batch.update(userRef, { followingCount: increment(1) });
        batch.update(targetRef, { followerCount: increment(1) });
      }
      await batch.commit();
    } catch (error: any) {
      console.error("Follow error:", error);
      // Fallback for missing permissions or other failures
      if (error.message?.includes('permissions')) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/following`);
      }
    }
  };

  const handleViewProfile = (targetUserId: string) => {
    setSelectedProfileId(targetUserId);
  };

  const handleViewFollowList = async (targetUserId: string, type: 'followers' | 'following') => {
    try {
      const listPath = `users/${targetUserId}/${type}`;
      const snap = await getDocs(query(collection(db, listPath), limit(20)));
      const ids = snap.docs.map(doc => type === 'followers' ? doc.data().followerId : doc.data().followingId);
      
      if (ids.length === 0) {
        setFollowList({ type, users: [] });
        return;
      }

      // Fetch user details for these IDs
      const usersData = await Promise.all(ids.map(async (id) => {
        const uDoc = await getDoc(doc(db, 'users', id));
        return uDoc.exists() ? { uid: id, ...uDoc.data() } : null;
      }));

      setFollowList({ type, users: usersData.filter(u => u !== null) });
    } catch (error) {
      console.error(`Error fetching ${type}:`, error);
    }
  };

  const handleToggleTask = async (circleId: string, taskId: string) => {
    if (!user) return;
    const circle = circles.find(c => c.id === circleId);
    if (!circle || !circle.tasks) return;

    const updatedTasks = circle.tasks.map(t => 
      t.id === taskId ? { ...t, completed: !t.completed } : t
    );

    try {
      await updateDoc(doc(db, 'circles', circleId), { tasks: updatedTasks });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `circles/${circleId}`);
    }
  };

  const filteredPosts = useMemo(() => {
    let result = posts;
    
    // Filter by selected circle
    if (selectedCircleId) {
      result = result.filter(post => post.circleId === selectedCircleId);
    }

    // Filter by following only
    if (showFollowingOnly) {
      result = result.filter(post => userFollowing.has(post.authorId));
    }

    // Filter by search query
    if (!searchQuery.trim()) return result;
    const queryStr = searchQuery.toLowerCase();
    return result.filter(post => 
      post.title.toLowerCase().includes(queryStr) ||
      post.content.toLowerCase().includes(queryStr) ||
      post.authorName.toLowerCase().includes(queryStr) ||
      post.type.toLowerCase().includes(queryStr)
    );
  }, [posts, searchQuery, showFollowingOnly, userFollowing, selectedCircleId]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto px-6 pt-12 pb-40"
    >
      <section className="mb-16 flex justify-between items-end">
        <div className="space-y-6">
          <span className="text-xs font-headline font-black tracking-[0.2em] uppercase text-tertiary">{t('community.header_tagline')}</span>
          <h2 className="font-headline text-6xl md:text-8xl font-black text-primary leading-[0.9] tracking-tighter">
            {t('community.header_title')}
          </h2>
          <p className="text-on-surface-variant text-xl max-w-xl leading-relaxed">{t('community.header_desc')}</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setShowCreateCircle(true)}
            className="bg-surface-container-high text-primary px-8 h-20 rounded-[2rem] shadow-ambient flex items-center gap-3 font-headline font-black uppercase tracking-widest text-sm hover:scale-105 transition-all"
          >
            <LayoutGrid size={24} /> {t('community.create_circle')}
          </button>
          <button 
            onClick={() => setShowAdd(true)}
            className="bg-primary text-on-primary px-8 h-20 rounded-[2rem] shadow-ambient flex items-center gap-3 font-headline font-black uppercase tracking-widest text-sm hover:scale-105 transition-all"
          >
            <Plus size={32} /> {t('community.create_post')}
          </button>
        </div>
      </section>

      {/* Circle Filter Bar */}
      <div className="mb-12 flex items-center gap-4 overflow-x-auto pb-4 no-scrollbar">
        <button 
          onClick={() => {
            setSelectedCircleId(null);
            setShowFollowingOnly(false);
          }}
          className={cn(
            "px-8 py-4 rounded-2xl font-headline font-black text-sm uppercase tracking-widest transition-all whitespace-nowrap",
            (selectedCircleId === null && !showFollowingOnly) ? "bg-primary text-on-primary shadow-ambient" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
          )}
        >
          {t('community.all_feed')}
        </button>
        <button 
          onClick={() => {
            setSelectedCircleId(null);
            setShowFollowingOnly(true);
          }}
          className={cn(
            "px-8 py-4 rounded-2xl font-headline font-black text-sm uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-3",
            showFollowingOnly ? "bg-primary text-on-primary shadow-ambient" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
          )}
        >
          <UserCheck size={18} /> {t('community.following')}
        </button>
        {circles.filter(circle => userCircles.has(circle.id)).map(circle => (
          <button 
            key={circle.id}
            onClick={() => {
              setSelectedCircleId(circle.id);
              setShowFollowingOnly(false);
            }}
            className={cn(
              "px-8 py-4 rounded-2xl font-headline font-black text-sm uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-3",
              selectedCircleId === circle.id ? "bg-primary text-on-primary shadow-ambient" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            {circle.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        {/* Left Column: The Feed - Editorial Style */}
        <div className="lg:col-span-7 space-y-16">
          {/* Who to follow - Horizontal Scroll */}
          {recommendedUsers.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-headline font-black uppercase tracking-[0.2em] text-primary">{t('community.who_to_follow')}</h3>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => scrollRecommended('left')}
                      className="p-1 rounded-full hover:bg-primary/10 text-primary transition-all disabled:opacity-20"
                      aria-label="Previous suggestions"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button 
                      onClick={() => scrollRecommended('right')}
                      className="p-1 rounded-full hover:bg-primary/10 text-primary transition-all disabled:opacity-20"
                      aria-label="Next suggestions"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
                <div className="h-px flex-1 bg-outline-variant mx-6 opacity-20" />
              </div>
              <div 
                ref={recommendedRef}
                className="flex gap-6 overflow-x-auto pb-6 no-scrollbar snap-x snap-mandatory scroll-smooth"
              >
                {recommendedUsers.map((recUser) => (
                  <motion.div 
                    key={recUser.uid}
                    whileHover={{ y: -5 }}
                    className="bg-surface-container-low p-6 rounded-[2.5rem] shadow-ambient min-w-[220px] flex flex-col items-center text-center space-y-4 border border-primary/5 snap-start group"
                  >
                    <div className="relative cursor-pointer" onClick={() => handleViewProfile(recUser.uid)}>
                      <img 
                        src={recUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${recUser.uid}`} 
                        className="w-24 h-24 rounded-3xl object-cover shadow-sm group-hover:scale-105 transition-transform"
                        alt={recUser.displayName}
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full border-2 border-surface flex items-center justify-center">
                        <Star size={12} className="text-white fill-white" />
                      </div>
                    </div>
                    <div>
                      <h4 
                        className="font-headline font-black text-on-surface text-lg truncate w-full max-w-[180px] cursor-pointer hover:text-primary transition-colors"
                        onClick={() => handleViewProfile(recUser.uid)}
                      >
                        {recUser.displayName || t('common.anonymous')}
                      </h4>
                      <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t(`settings.role_${recUser.role || 'patient'}`)}</p>
                    </div>
                    <button 
                      onClick={() => handleFollowUser(recUser.uid)}
                      className={cn(
                        "w-full py-3 rounded-xl text-[10px] font-headline font-black uppercase tracking-widest transition-all",
                        userFollowing.has(recUser.uid) ? "bg-primary/10 text-primary" : "bg-primary text-on-primary shadow-sm hover:scale-105"
                      )}
                    >
                      {userFollowing.has(recUser.uid) ? t('community.following') : t('community.follow')}
                    </button>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Search Bar */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-8 flex items-center pointer-events-none">
              <Search size={24} className="text-outline group-focus-within:text-primary transition-colors" />
            </div>
            <input 
              type="text"
              placeholder={t('community.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-20 bg-surface-container-low pl-20 pr-8 rounded-[2rem] font-headline font-bold text-lg shadow-ambient border border-primary/5 focus:outline-primary transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-8 flex items-center text-outline hover:text-primary transition-colors"
              >
                <X size={24} />
              </button>
            )}
          </div>

          {filteredPosts.length === 0 ? (
            <div className="text-center py-32 bg-surface-container-low rounded-[3rem] shadow-ambient">
              <Users size={64} className="mx-auto text-outline mb-6 opacity-20" />
              <p className="text-on-surface-variant text-xl font-headline font-bold">
                {searchQuery ? t('community.no_posts_search').replace('{query}', searchQuery) : t('community.no_posts_default')}
              </p>
            </div>
          ) : (
            filteredPosts.map((post) => (
              <article key={post.id} className={cn(
                "rounded-[3rem] p-10 shadow-ambient relative overflow-hidden transition-all hover:scale-[1.01]",
                post.type === 'milestone' ? "bg-tertiary-container" : "bg-surface-container-low"
              )}>
                <div className="flex items-center justify-between mb-8 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="relative cursor-pointer" onClick={() => handleViewProfile(post.authorId)}>
                      <img 
                        src={post.authorPhoto || `https://picsum.photos/seed/${post.authorId}/100/100`} 
                        className="w-14 h-14 rounded-2xl object-cover shadow-sm"
                        alt={post.authorName}
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full border-2 border-surface flex items-center justify-center">
                        <Star size={10} className="text-white fill-white" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 
                          className={cn("text-xl font-headline font-black cursor-pointer hover:underline", post.type === 'milestone' ? "text-on-tertiary-container" : "text-primary")}
                          onClick={() => handleViewProfile(post.authorId)}
                        >
                          {post.authorName}
                        </h3>
                        {user?.uid !== post.authorId && (
                          <button 
                            onClick={() => handleFollowUser(post.authorId)}
                            className={cn(
                              "text-[10px] font-headline font-black uppercase tracking-widest px-3 py-1 rounded-lg transition-all",
                              userFollowing.has(post.authorId) ? "bg-primary/10 text-primary" : "bg-surface-container-highest text-outline hover:bg-primary/5"
                            )}
                          >
                            {userFollowing.has(post.authorId) ? t('community.following_btn') : t('community.follow_btn')}
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] opacity-60 uppercase font-headline font-black tracking-widest">
                        {t(`community.post_type_${post.type}`)} • {new Date(post.timestamp).toLocaleDateString(language === 'ms' ? 'ms-MY' : language === 'zh' ? 'zh-CN' : 'en-MY', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {(user?.uid === post.authorId || profile?.role === 'admin') && (
                      <button 
                        onClick={() => setShowDeleteConfirm(post.id)}
                        className="w-10 h-10 rounded-xl hover:bg-tertiary/10 flex items-center justify-center transition-all group"
                        title={t('community.delete_post_tooltip')}
                      >
                        <X size={20} className="text-outline group-hover:text-tertiary" />
                      </button>
                    )}
                    <button 
                      onClick={() => setShowPostOptions(showPostOptions === post.id ? null : post.id)}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        showPostOptions === post.id ? "bg-primary text-on-primary" : "hover:bg-on-surface/5 text-outline"
                      )}
                    >
                      <MoreHorizontal size={24} />
                    </button>
                    
                    {/* Post Options Dropdown */}
                    <AnimatePresence>
                      {showPostOptions === post.id && (
                        <div className="absolute right-0 top-14 z-[60]">
                           <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -10 }}
                            className="bg-surface-container-low rounded-2xl shadow-2xl border border-primary/10 overflow-hidden w-48"
                          >
                            <button 
                              onClick={() => handleBookmark(post.id)}
                              className="w-full flex items-center gap-3 px-6 py-4 hover:bg-primary/10 transition-colors text-on-surface hover:text-primary active:bg-primary/20"
                            >
                              <Bookmark size={18} className={cn(userBookmarks.has(post.id) && "fill-primary text-primary")} />
                              <span className="text-sm font-headline font-bold">{userBookmarks.has(post.id) ? t('community.unbookmark') : t('community.bookmark')}</span>
                            </button>
                            <button 
                              onClick={() => handleShare(post.id)}
                              className="w-full flex items-center gap-3 px-6 py-4 hover:bg-primary/10 transition-colors text-on-surface hover:text-primary active:bg-primary/20"
                            >
                              <Share2 size={18} />
                              <span className="text-sm font-headline font-bold">{t('community.share')}</span>
                            </button>
                            <button 
                              onClick={() => {
                                alert(t('community.report_success'));
                                setShowPostOptions(null);
                              }}
                              className="w-full flex items-center gap-3 px-6 py-4 hover:bg-red-50 transition-all text-red-600"
                            >
                              <ShieldAlert size={18} />
                              <span className="text-sm font-headline font-bold">{t('community.report')}</span>
                            </button>
                          </motion.div>
                          <div className="fixed inset-0 z-[-1]" onClick={() => setShowPostOptions(null)} />
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <h3 className={cn("text-3xl font-headline font-black mb-4 tracking-tight leading-tight relative z-10", post.type === 'milestone' ? "text-on-tertiary-container" : "text-on-surface")}>
                  {post.title}
                </h3>
                <p className={cn("text-lg leading-relaxed mb-8 relative z-10", post.type === 'milestone' ? "text-on-tertiary-container/80" : "text-on-surface-variant")}>
                  {post.content}
                </p>

                {post.location && (
                  <div className="flex flex-wrap gap-4 mb-10 relative z-10">
                    <div className="flex items-center gap-3 text-xs font-headline font-black uppercase tracking-widest text-on-primary bg-primary px-6 py-3 rounded-xl shadow-sm">
                      <Calendar size={16} /> {post.eventDate}
                    </div>
                    <div className="flex items-center gap-3 text-xs font-headline font-black uppercase tracking-widest text-on-tertiary bg-tertiary px-6 py-3 rounded-xl shadow-sm">
                      <MapPin size={16} /> {post.location}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-8">
                    <button 
                      onClick={() => handleLike(post.id)}
                      className="flex items-center gap-3 text-on-surface-variant hover:text-primary transition-all group"
                    >
                      <motion.div 
                        whileTap={{ scale: 0.8 }}
                        animate={{ 
                          scale: userLikes.has(post.id) ? [1, 1.4, 1] : 1,
                          rotate: userLikes.has(post.id) ? [0, 15, -15, 0] : 0
                        }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                          userLikes.has(post.id) ? "bg-primary/10 text-primary" : "bg-surface-container-highest text-outline group-hover:bg-primary/5"
                        )}
                      >
                        <Heart size={24} className={cn(userLikes.has(post.id) && "fill-primary")} />
                      </motion.div>
                      <div className="overflow-hidden h-7">
                        <motion.span 
                          key={post.likes}
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          className="text-lg font-headline font-black block"
                        >
                          {post.likes}
                        </motion.span>
                      </div>
                    </button>
                    <button 
                      onClick={() => setShowComments(post.id)}
                      className="flex items-center gap-3 text-on-surface-variant hover:text-primary transition-all group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-surface-container-highest flex items-center justify-center text-outline group-hover:bg-primary/5 transition-all">
                        <MessageCircle size={24} />
                      </div>
                      <span className="text-lg font-headline font-black">
                        {post.commentsCount && post.commentsCount > 0 ? post.commentsCount : t('community.comment')}
                      </span>
                    </button>
                    <button 
                      onClick={() => handleBookmark(post.id)}
                      className="flex items-center gap-3 text-on-surface-variant hover:text-primary transition-all group"
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                        userBookmarks.has(post.id) ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-highest text-outline group-hover:bg-primary/5"
                      )}>
                        <Bookmark size={24} className={cn(userBookmarks.has(post.id) && "fill-primary")} />
                      </div>
                      <span className="text-lg font-headline font-black">
                        {(post.bookmarksCount && post.bookmarksCount > 0) 
                          ? post.bookmarksCount 
                          : (userBookmarks.has(post.id) ? '1' : t('community.bookmark'))}
                      </span>
                    </button>
                  </div>
                  {post.type === 'event' && (
                    <motion.button 
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleRSVP(post)}
                      className={cn(
                        "px-10 py-4 rounded-2xl font-headline font-black text-sm uppercase tracking-widest shadow-ambient transition-all relative overflow-hidden",
                        userRSVPs.has(post.id) 
                          ? "bg-surface-container-highest text-primary border-2 border-primary" 
                          : "signature-gradient text-on-primary"
                      )}
                    >
                      <motion.div
                        key={userRSVPs.has(post.id) ? 'joined' : 'join'}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="flex items-center gap-2"
                      >
                        {userRSVPs.has(post.id) ? (
                          <>
                            <Check size={18} /> {t('community.joined')} 
                            <motion.span
                              key={post.attendees}
                              initial={{ scale: 1.5, color: '#00440c' }}
                              animate={{ scale: 1, color: 'currentColor' }}
                            >
                              ({post.attendees || 0})
                            </motion.span>
                          </>
                        ) : (
                          <>
                            {t('community.join_event')} 
                            <motion.span
                              key={post.attendees}
                              initial={{ scale: 1.5 }}
                              animate={{ scale: 1 }}
                            >
                              ({post.attendees || 0})
                            </motion.span>
                          </>
                        )}
                      </motion.div>
                      {userRSVPs.has(post.id) && (
                        <motion.div 
                          initial={{ scale: 0, opacity: 0.5 }}
                          animate={{ scale: 4, opacity: 0 }}
                          transition={{ duration: 0.6 }}
                          className="absolute inset-0 bg-primary/20 rounded-full"
                        />
                      )}
                    </motion.button>
                  )}
                </div>

                {post.type === 'milestone' && (
                  <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
                )}
              </article>
            ))
          )}
        </div>

        {/* Right Column: Community Pulse - Tonal Depth */}
        <aside className="lg:col-span-5 space-y-16">
          <section className="bg-surface-container-low p-10 rounded-[3rem] shadow-ambient">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <h3 className="font-headline text-2xl text-primary font-black tracking-tight">{t('community.pulse_title')}</h3>
            </div>
            
            <div className="space-y-6">
              <div className="bg-surface-container-highest p-6 rounded-2xl">
                 <p className="text-[10px] font-headline font-black uppercase tracking-[0.2em] text-primary mb-3">{t('community.active_bookmarks') || 'My Bookmarks'}</p>
                 <div className="flex items-center gap-2">
                   <div className="bg-primary/10 p-2 rounded-lg text-primary">
                    <Bookmark size={16} className="fill-primary" />
                   </div>
                   <span className="font-headline font-black text-on-surface">{userBookmarks.size} {t('community.saved_items') || 'Items Saved'}</span>
                 </div>
              </div>
              <p className="text-[10px] font-headline font-black uppercase tracking-[0.2em] text-outline mb-2">{t('community.recommended_circles')}</p>
              <div className="grid grid-cols-1 gap-4">
                {circles.length === 0 ? (
                  <div className="p-6 rounded-[2rem] border border-dashed border-outline-variant/30 text-center">
                    <p className="text-sm font-headline font-bold text-on-surface-variant italic">{t('community.no_circles')}</p>
                  </div>
                ) : (
                  circles.filter(c => !userCircles.has(c.id)).slice(0, 3).map((circle, idx) => {
                    const Icon = (circle.icon === 'Trees' ? Trees : circle.icon === 'Droplets' ? Droplets : Leaf);
                    return (
                      <div key={circle.id} className={cn("p-6 rounded-[2rem] border border-outline-variant/10 group cursor-pointer hover:scale-[1.02] transition-all bg-surface-container-highest/30 relative")}>
                        <div className="flex items-center justify-between">
                          <div 
                            className="flex items-center gap-4" 
                            onClick={() => {
                              setSelectedCircleId(circle.id);
                              setShowFollowingOnly(false);
                            }}
                          >
                            <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm">
                              <Icon size={24} className="text-primary" />
                            </div>
                            <div>
                              <p className="font-headline font-black text-on-surface">{circle.name}</p>
                              <p className="text-[10px] font-headline font-bold text-on-surface-variant uppercase tracking-widest">{circle.memberCount} {t('community.members')}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleJoinCircle(circle.id)}
                            className="bg-primary text-on-primary px-4 py-2 rounded-xl text-[10px] font-headline font-black uppercase tracking-widest shadow-sm hover:scale-105 transition-all"
                          >
                            {t('community.join')}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
                {circles.filter(c => !userCircles.has(c.id)).length === 0 && (
                  <p className="text-xs text-on-surface-variant italic text-center py-4">{t('community.no_recommendations')}</p>
                )}
              </div>

              <p className="text-[10px] font-headline font-black uppercase tracking-[0.2em] text-outline mb-2 mt-8">{t('community.active_circles')}</p>
              <div className="grid grid-cols-1 gap-4">
                {circles.filter(c => userCircles.has(c.id)).length === 0 ? (
                  <div className="p-6 rounded-[2rem] border border-dashed border-outline-variant/30 text-center">
                    <p className="text-sm font-headline font-bold text-on-surface-variant italic">{t('community.no_circles')}</p>
                  </div>
                ) : (
                  circles.filter(c => userCircles.has(c.id)).slice(0, 3).map((circle, idx) => {
                    const Icon = (circle.icon === 'Trees' ? Trees : circle.icon === 'Droplets' ? Droplets : Leaf);
                    return (
                      <div key={circle.id} className={cn("p-6 rounded-[2rem] border border-outline-variant/10 group cursor-pointer hover:scale-[1.02] transition-all bg-surface-container-highest/30 relative")}>
                        <div className="flex items-center justify-between">
                          <div 
                            className="flex items-center gap-4" 
                            onClick={() => {
                              setSelectedCircleId(circle.id);
                              setShowFollowingOnly(false);
                            }}
                          >
                            <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm">
                              <Icon size={24} className="text-primary" />
                            </div>
                            <div>
                              <p className="font-headline font-black text-on-surface">{circle.name}</p>
                              <p className="text-[10px] font-headline font-bold text-on-surface-variant uppercase tracking-widest">{circle.memberCount} {t('community.members')}</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleJoinCircle(circle.id)}
                            className="bg-primary/10 text-primary px-4 py-2 rounded-xl text-[10px] font-headline font-black uppercase tracking-widest transition-all"
                          >
                            {t('community.joined')}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-10 pt-8 border-t border-outline-variant/10 relative">
                <Quote className="text-primary/10 absolute -top-2 -left-2" size={48} />
                <p className="text-lg font-headline font-bold text-on-surface-variant italic leading-relaxed relative z-10 pl-4">
                  {t('community.quote')}
                </p>
              </div>
            </div>
          </section>

          {selectedCircleId && circles.find(c => c.id === selectedCircleId)?.tasks && (
            <section className="bg-surface-container-low p-10 rounded-[3rem] shadow-ambient">
              <div className="flex items-center gap-3 mb-8">
                <Trophy className="text-tertiary" size={24} />
                <h3 className="font-headline text-2xl text-primary font-black tracking-tight">{t('community.circle_tasks')}</h3>
              </div>
              <div className="space-y-4">
                {circles.find(c => c.id === selectedCircleId)?.tasks?.map(task => (
                  <div 
                    key={task.id} 
                    onClick={() => handleToggleTask(selectedCircleId, task.id)}
                    className={cn(
                      "p-5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all",
                      task.completed ? "bg-tertiary/5 border-tertiary/20" : "bg-surface-container-highest border-outline-variant/10 hover:border-primary/20"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                        task.completed ? "bg-tertiary border-tertiary" : "border-outline"
                      )}>
                        {task.completed && <Check size={14} className="text-white" />}
                      </div>
                      <span className={cn("font-headline font-bold", task.completed ? "text-on-surface/50 line-through" : "text-on-surface")}>
                        {task.title}
                      </span>
                    </div>
                    <span className="text-[10px] font-headline font-black text-tertiary">+{task.points} XP</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-tertiary-container p-10 rounded-[3rem] shadow-ambient relative overflow-hidden">
            <h3 className="font-headline text-2xl text-on-tertiary-container mb-4 font-black tracking-tight relative z-10">{t('community.spirit_title')}</h3>
            {(() => {
              const activeCircle = selectedCircleId ? circles.find(c => c.id === selectedCircleId) : null;
              const completedTasks = activeCircle?.tasks?.filter(t => t.completed).length || 0;
              const totalTasks = activeCircle?.tasks?.length || 1;
              const progress = Math.round((completedTasks / totalTasks) * 100);
              
              return (
                <>
                  <p className="text-lg text-on-tertiary-container/80 mb-8 relative z-10">
                    {selectedCircleId 
                      ? t('community.spirit_progress').replace('{name}', activeCircle?.name || '').replace('{progress}', progress.toString())
                      : t('community.spirit_energetic')}
                  </p>
                  <div className="h-4 w-full bg-on-tertiary-container/10 rounded-full overflow-hidden mb-4 relative z-10">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${selectedCircleId ? progress : 82}%` }}
                      className="h-full signature-gradient rounded-full shadow-sm" 
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-on-tertiary-container/60 font-headline font-black tracking-[0.2em] uppercase relative z-10">
                    <span>{selectedCircleId ? t('community.spirit_starting') : t('community.spirit_quiet')}</span>
                    <span>{selectedCircleId ? t('community.spirit_goal_reached') : t('community.spirit_vibrant')}</span>
                  </div>
                </>
              );
            })()}
            <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-primary/5 rounded-full blur-2xl" />
          </section>

          {/* Personal Profile Quick Actions */}
          <section className="bg-surface-container-low p-8 rounded-[3rem] shadow-ambient border border-primary/5">
            <div className="flex items-center gap-6 mb-8">
              <img 
                src={user?.photoURL || `https://picsum.photos/seed/${user?.uid}/100/100`} 
                className="w-20 h-20 rounded-[2rem] object-cover shadow-sm"
                alt="My Profile"
              />
              <div>
                <h3 className="font-headline text-2xl text-on-surface font-black tracking-tight">{user?.displayName || t('community.view_profile')}</h3>
                <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('community.member_status')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => {
                  setEditProfileData({
                    displayName: profile?.displayName || user?.displayName || '',
                    photoURL: profile?.photoURL || user?.photoURL || '',
                    bio: profile?.bio || ''
                  });
                  setShowEditProfile(true);
                }}
                className="py-4 bg-surface-container-highest/50 rounded-2xl font-headline font-black text-[10px] uppercase tracking-widest text-primary hover:bg-primary/10 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={14} /> {t('community.edit_profile')}
              </button>
              <button 
                onClick={() => handleViewProfile(user?.uid || '')}
                className="py-4 bg-primary/10 rounded-2xl font-headline font-black text-[10px] uppercase tracking-widest text-primary hover:bg-primary/20 transition-all flex items-center justify-center gap-2"
              >
                <LayoutGrid size={14} /> {t('community.my_posts')}
              </button>
            </div>
          </section>

          {/* Community Leaders & Recommended */}
          <section className="bg-surface-container-low p-10 rounded-[3rem] shadow-ambient border border-primary/5">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-headline text-2xl text-primary font-black tracking-tight">{t('community.leaders_peers')}</h3>
              <Trophy size={24} className="text-tertiary" />
            </div>
            
            <div className="space-y-6">
              {recommendedUsers.map((u) => {
                const isFollowing = userFollowing.has(u.uid);
                return (
                  <div key={u.uid} className="flex items-center justify-between group">
                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => handleViewProfile(u.uid)}>
                      <div className="relative">
                        <img 
                          src={u.photoURL || `https://picsum.photos/seed/${u.uid}/100/100`} 
                          className="w-14 h-14 rounded-2xl object-cover shadow-sm group-hover:scale-105 transition-transform"
                          alt={u.displayName}
                        />
                        {u.role === 'leader' && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-tertiary rounded-full flex items-center justify-center border-2 border-surface">
                            <Star size={10} className="text-on-tertiary fill-on-tertiary" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-headline font-black text-on-surface text-sm">{u.displayName}</p>
                        <p className="text-[9px] font-headline font-bold text-outline uppercase tracking-widest">{u.role ? t(`settings.role_${u.role}`) : t('community.member')}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleFollowUser(u.uid)}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        isFollowing ? "bg-primary/10 text-primary" : "bg-primary text-on-primary shadow-sm hover:scale-110"
                      )}
                    >
                      {isFollowing ? <Check size={18} /> : <UserPlus size={18} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Featured Member - Editorial Profile */}
          {recommendedUsers.length > 0 && (
            <section className="text-center p-12 bg-surface-container-low rounded-[3rem] shadow-ambient border border-primary/5">
              <div className="relative inline-block mb-6 cursor-pointer" onClick={() => handleViewProfile(recommendedUsers[0].uid)}>
                <div className="w-32 h-32 rounded-[2.5rem] p-1 bg-signature-gradient shadow-ambient">
                  <img 
                    className="w-full h-full rounded-[2.3rem] object-cover border-4 border-surface" 
                    src={recommendedUsers[0].photoURL || `https://picsum.photos/seed/${recommendedUsers[0].uid}/200/200`} 
                    alt={recommendedUsers[0].displayName}
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-tertiary text-on-tertiary rounded-2xl flex items-center justify-center shadow-ambient border-4 border-surface">
                  <Star size={16} className="fill-on-tertiary" />
                </div>
              </div>
              <h4 className="font-headline text-3xl text-on-surface font-black tracking-tight cursor-pointer" onClick={() => handleViewProfile(recommendedUsers[0].uid)}>
                {recommendedUsers[0].displayName}
              </h4>
              <p className="text-sm font-headline font-bold text-on-surface-variant uppercase tracking-widest mt-2 mb-8">
                {recommendedUsers[0].role === 'leader' ? t('community.leader') : t('community.contributor')} • {t('community.active_member')}
              </p>
              <button 
                onClick={() => handleViewProfile(recommendedUsers[0].uid)}
                className="w-full py-5 signature-gradient text-on-primary rounded-2xl font-headline font-black text-sm uppercase tracking-widest shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                {t('community.view_profile')}
              </button>
            </section>
          )}
        </aside>
      </div>

      {/* Create Post Modal - Glass Depth */}
      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-on-surface/10 backdrop-blur-xl" onClick={() => setShowAdd(false)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 40 }}
              className="bg-surface-container-low w-full max-w-2xl rounded-[3rem] p-4 sm:p-8 lg:p-12 shadow-2xl relative z-10 max-h-[95vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4 sm:mb-12">
                <h2 className="text-2xl sm:text-4xl font-headline font-black text-primary tracking-tighter">{t('community.share_something')}</h2>
                <button onClick={() => setShowAdd(false)} className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl hover:bg-on-surface/5 flex items-center justify-center transition-all">
                  <X size={32} className="w-6 h-6 sm:w-8 sm:h-8 text-outline" />
                </button>
              </div>

              <div className="space-y-6 sm:space-y-10">
                <div className="space-y-4">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('community.post_type')}</label>
                  <div className="flex gap-4">
                    {['tip', 'event', 'milestone'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setNewPost({ ...newPost, type: t as any })}
                        className={cn(
                          "flex-1 py-4 rounded-2xl text-sm font-headline font-black uppercase tracking-widest transition-all",
                          newPost.type === t 
                            ? "bg-primary text-on-primary shadow-ambient" 
                            : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('community.posting_to')}</label>
                  <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                    <button
                      onClick={() => setNewPost({ ...newPost, circleId: '' })}
                      className={cn(
                        "shrink-0 px-6 py-4 rounded-2xl text-sm font-headline font-black tracking-widest transition-all whitespace-nowrap",
                        !newPost.circleId || newPost.circleId === ''
                          ? "bg-primary text-on-primary shadow-ambient"
                          : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high"
                      )}
                    >
                      {t('community.all_feed')}
                    </button>
                    {circles.filter(c => userCircles.has(c.id)).map(c => (
                      <button
                        key={c.id}
                        onClick={() => setNewPost({ ...newPost, circleId: c.id })}
                        className={cn(
                          "shrink-0 px-6 py-4 rounded-2xl text-sm font-headline font-black tracking-widest transition-all whitespace-nowrap flex items-center gap-2",
                          newPost.circleId === c.id
                            ? "bg-primary text-on-primary shadow-ambient"
                            : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high"
                        )}
                      >
                        <Users size={16} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('community.title')}</label>
                  <input 
                    type="text" 
                    value={newPost.title}
                    onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                    className="w-full h-16 bg-surface-container-highest px-8 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                    placeholder={t('community.title') + "..."}
                  />
                </div>

                {newPost.type === 'event' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('community.location')}</label>
                      <input 
                        type="text" 
                        value={newPost.location}
                        onChange={(e) => setNewPost({ ...newPost, location: e.target.value })}
                        className="w-full h-16 bg-surface-container-highest px-8 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                        placeholder="Contoh: Taman KLCC"
                      />
                    </div>
                    <div className="space-y-4">
                      <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('community.event_date')}</label>
                      <input 
                        type="date" 
                        value={newPost.eventDate}
                        onChange={(e) => setNewPost({ ...newPost, eventDate: e.target.value })}
                        className="w-full h-16 bg-surface-container-highest px-8 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('community.content')}</label>
                  <textarea 
                    value={newPost.content}
                    onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                    className="w-full bg-surface-container-highest p-8 rounded-[2rem] font-headline font-bold text-lg focus:outline-primary h-48 resize-none transition-all"
                    placeholder={t('community.content') + "..."}
                  />
                </div>

                <button 
                  onClick={handleCreatePost}
                  disabled={isSubmitting}
                  className="w-full py-6 signature-gradient text-on-primary rounded-2xl font-headline font-black text-xl shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? t('community.sending') : t('community.send_post')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Circle Modal */}
      <AnimatePresence>
        {showCreateCircle && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-on-surface/10 backdrop-blur-xl" onClick={() => setShowCreateCircle(false)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 40 }}
              className="bg-surface-container-low w-full max-w-2xl rounded-[3rem] p-4 sm:p-8 lg:p-12 shadow-2xl relative z-10 max-h-[95vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4 sm:mb-12">
                <h2 className="text-2xl sm:text-4xl font-headline font-black text-primary tracking-tighter">{t('community.create_circle_title')}</h2>
                <button onClick={() => setShowCreateCircle(false)} className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl hover:bg-on-surface/5 flex items-center justify-center transition-all">
                  <X size={32} className="w-6 h-6 sm:w-8 sm:h-8 text-outline" />
                </button>
              </div>

              <div className="space-y-6 sm:space-y-10 p-1">
                <div className="space-y-4">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('community.circle_name')}</label>
                  <input 
                    type="text" 
                    value={newCircle.name}
                    onChange={(e) => setNewCircle({ ...newCircle, name: e.target.value })}
                    className="w-full h-16 bg-surface-container-highest px-8 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all"
                    placeholder={t('community.circle_name_placeholder')}
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('community.description')}</label>
                  <textarea 
                    value={newCircle.description}
                    onChange={(e) => setNewCircle({ ...newCircle, description: e.target.value })}
                    className="w-full bg-surface-container-highest p-8 rounded-[2rem] font-headline font-bold text-lg focus:outline-primary h-32 resize-none transition-all"
                    placeholder={t('community.circle_desc_placeholder')}
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-headline font-black uppercase tracking-widest text-outline ml-2">{t('community.choose_icon')}</label>
                  <div className="flex gap-4">
                    {['Leaf', 'Trees', 'Droplets'].map((icon) => (
                      <button
                        key={icon}
                        onClick={() => setNewCircle({ ...newCircle, icon })}
                        className={cn(
                          "flex-1 py-4 rounded-2xl text-sm font-headline font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                          newCircle.icon === icon 
                            ? "bg-primary text-on-primary shadow-ambient" 
                            : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-container-high"
                        )}
                      >
                        {icon === 'Leaf' && <Leaf size={20} />}
                        {icon === 'Trees' && <Trees size={20} />}
                        {icon === 'Droplets' && <Droplets size={20} />}
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={handleCreateCircle}
                  disabled={isSubmitting}
                  className="w-full py-6 signature-gradient text-on-primary rounded-2xl font-headline font-black text-xl shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? t('community.creating') : t('community.create_btn')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {showEditProfile && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-on-surface/30 backdrop-blur-md" onClick={() => setShowEditProfile(false)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface-container-low w-full max-w-md rounded-[2.5rem] p-4 sm:p-8 lg:p-10 shadow-2xl relative z-10 max-h-[95vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4 sm:mb-8">
                <h3 className="text-xl sm:text-3xl font-headline font-black text-primary tracking-tight">{t('community.edit_profile')}</h3>
                <button onClick={() => setShowEditProfile(false)} className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl hover:bg-on-surface/5 flex items-center justify-center">
                  <X size={24} className="w-5 h-5 sm:w-6 sm:h-6 text-outline" />
                </button>
              </div>

              <div className="space-y-8">
                <div className="flex justify-center mb-8">
                  <div className="relative group">
                    <img 
                      src={editProfileData.photoURL || `https://picsum.photos/seed/${user?.uid}/200/200`} 
                      className="w-32 h-32 rounded-[2.5rem] object-cover shadow-ambient border-4 border-surface"
                      alt="Preview"
                    />
                    <div className="absolute inset-0 bg-black/40 rounded-[2.5rem] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Plus size={32} className="text-white" />
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-headline font-black text-outline uppercase tracking-widest ml-4 mb-2 block">{t('settings.display_name_label')}</label>
                    <input 
                      type="text"
                      value={editProfileData.displayName}
                      onChange={(e) => setEditProfileData({ ...editProfileData, displayName: e.target.value })}
                      className="w-full px-6 py-4 bg-surface-container-highest/50 rounded-2xl border-none focus:ring-2 focus:ring-primary/20 font-headline font-bold text-on-surface"
                      placeholder={t('settings.display_name_placeholder')}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-headline font-black text-outline uppercase tracking-widest ml-4 mb-2 block">{t('settings.photo_url_label')}</label>
                    <input 
                      type="text"
                      value={editProfileData.photoURL}
                      onChange={(e) => setEditProfileData({ ...editProfileData, photoURL: e.target.value })}
                      className="w-full px-6 py-4 bg-surface-container-highest/50 rounded-2xl border-none focus:ring-2 focus:ring-primary/20 font-headline font-bold text-on-surface"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-headline font-black text-outline uppercase tracking-widest ml-4 mb-2 block">{t('community.bio')}</label>
                    <textarea 
                      value={editProfileData.bio}
                      onChange={(e) => setEditProfileData({ ...editProfileData, bio: e.target.value })}
                      className="w-full px-6 py-4 bg-surface-container-highest/50 rounded-2xl border-none focus:ring-2 focus:ring-primary/20 font-headline font-bold text-on-surface h-32 resize-none"
                      placeholder={t('community.bio_placeholder')}
                    />
                  </div>
                </div>

                <button 
                  onClick={handleUpdateProfile}
                  disabled={isSubmitting}
                  className="w-full py-5 signature-gradient text-on-primary rounded-2xl font-headline font-black text-sm uppercase tracking-widest shadow-ambient hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? t('settings.saving') : t('settings.save')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {selectedProfile && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-on-surface/20 backdrop-blur-2xl" onClick={() => setSelectedProfileId(null)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 40 }}
              className="bg-surface-container-low w-full max-w-3xl rounded-[3rem] overflow-hidden shadow-2xl relative z-10 max-h-[90vh] flex flex-col"
            >
              <div className="relative h-48 signature-gradient">
                <button 
                  onClick={() => setSelectedProfileId(null)}
                  className="absolute top-6 right-6 w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl text-white flex items-center justify-center hover:bg-white/30 transition-all"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="px-12 pb-12 -mt-16 flex-1 overflow-y-auto no-scrollbar">
                <div className="flex items-end justify-between mb-12">
                  <div className="relative">
                    <img 
                      src={selectedProfile.photoURL || `https://picsum.photos/seed/${selectedProfile.uid}/200/200`} 
                      className="w-32 h-32 rounded-[2.5rem] border-8 border-surface-container-low object-cover shadow-ambient"
                      alt={selectedProfile.displayName}
                    />
                    <div className="absolute bottom-2 right-2 w-8 h-8 bg-tertiary rounded-xl flex items-center justify-center shadow-sm">
                      <Star size={16} className="text-white fill-white" />
                    </div>
                  </div>
                  <div className="flex gap-4 mb-2">
                    {user?.uid !== selectedProfile.uid && (
                      <button 
                        onClick={() => handleFollowUser(selectedProfile.uid)}
                        className={cn(
                          "px-8 py-3 rounded-2xl font-headline font-black text-xs uppercase tracking-widest shadow-ambient transition-all",
                          userFollowing.has(selectedProfile.uid) ? "bg-surface-container-highest text-primary border border-primary" : "bg-primary text-on-primary"
                        )}
                      >
                        {userFollowing.has(selectedProfile.uid) ? t('community.following_btn') : t('community.follow_btn')}
                      </button>
                    )}
                    {user?.uid !== selectedProfile.uid && (
                        <button 
                          onClick={() => {
                            if (selectedProfile) {
                              setActiveChatRecipient({
                                uid: selectedProfile.uid,
                                displayName: selectedProfile.displayName,
                                photoURL: selectedProfile.photoURL,
                                role: selectedProfile.role
                              });
                            }
                          }}
                          className="px-8 py-3 rounded-2xl bg-surface-container-highest text-on-surface-variant font-headline font-black text-xs uppercase tracking-widest shadow-sm hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
                        >
                          {t('community.message')}
                        </button>
                    )}
                  </div>
                </div>

                <div className="mb-12">
                  <h2 className="text-4xl font-headline font-black text-primary tracking-tighter">{selectedProfile.displayName}</h2>
                  <p className="text-xs font-headline font-black text-outline uppercase tracking-[0.2em] mt-2">{t(`settings.role_${selectedProfile.role}`)} • {t('community.member_status')}</p>
                  <p className="mt-6 text-on-surface-variant leading-relaxed max-w-xl">
                    {selectedProfile.bio || t('community.default_bio')}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-8 mb-12">
                  <div className="bg-surface-container-highest/50 p-6 rounded-3xl text-center">
                    <p className="text-2xl font-headline font-black text-primary">{selectedProfile.posts.length}</p>
                    <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('community.posts_count')}</p>
                  </div>
                  <div 
                    className="bg-surface-container-highest/50 p-6 rounded-3xl text-center cursor-pointer hover:bg-surface-container-high transition-colors"
                    onClick={() => handleViewFollowList(selectedProfile.uid, 'followers')}
                  >
                    <p className="text-2xl font-headline font-black text-primary">{selectedProfile.followersCount}</p>
                    <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('community.followers_count')}</p>
                  </div>
                  <div 
                    className="bg-surface-container-highest/50 p-6 rounded-3xl text-center cursor-pointer hover:bg-surface-container-high transition-colors"
                    onClick={() => handleViewFollowList(selectedProfile.uid, 'following')}
                  >
                    <p className="text-2xl font-headline font-black text-primary">{selectedProfile.followingCount}</p>
                    <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest">{t('community.following_count')}</p>
                  </div>
                </div>

                <div className="space-y-8">
                  <h3 className="text-xl font-headline font-black text-on-surface uppercase tracking-widest">{t('community.recent_activity')}</h3>
                  {selectedProfile.posts.length === 0 ? (
                    <p className="text-on-surface-variant italic">{t('community.no_posts_user')}</p>
                  ) : (
                    selectedProfile.posts.map(post => (
                      <div key={post.id} className="p-6 bg-surface-container-highest/30 rounded-3xl border border-outline-variant/10">
                        <h4 className="font-headline font-black text-lg text-primary mb-2">{post.title}</h4>
                        <p className="text-on-surface-variant line-clamp-2">{post.content}</p>
                        <div className="mt-4 flex items-center gap-4 text-[10px] font-headline font-black text-outline uppercase tracking-widest">
                          <span>{new Date(post.timestamp).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>{post.likes} {t('community.likes')}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Follow List Modal */}
      <AnimatePresence>
        {followList && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-on-surface/30 backdrop-blur-md" onClick={() => setFollowList(null)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface-container-low w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl relative z-10 max-h-[70vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-headline font-black text-primary capitalize">{t(`community.${followList.type}_count`)}</h3>
                <button onClick={() => setFollowList(null)} className="w-10 h-10 rounded-xl hover:bg-on-surface/5 flex items-center justify-center">
                  <X size={24} className="text-outline" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
                {followList.users.length === 0 ? (
                  <p className="text-center text-on-surface-variant py-8">{t(`community.no_${followList.type}`)}</p>
                ) : (
                  followList.users.map(u => (
                    <div 
                      key={u.uid} 
                      className="flex items-center justify-between p-4 rounded-2xl bg-surface-container-highest/30 hover:bg-surface-container-highest/50 transition-colors cursor-pointer"
                      onClick={() => {
                        handleViewProfile(u.uid);
                        setFollowList(null);
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <img 
                          src={u.photoURL || `https://picsum.photos/seed/${u.uid}/100/100`} 
                          className="w-12 h-12 rounded-xl object-cover"
                          alt={u.displayName}
                        />
                        <div>
                          <p className="font-headline font-black text-on-surface">{u.displayName}</p>
                          <p className="text-[10px] font-headline font-bold text-outline uppercase tracking-widest">{t(`settings.role_${u.role}`)}</p>
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-outline" />
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Comment Drawer */}
      <AnimatePresence>
        {showComments && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 md:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/30 backdrop-blur-md" 
              onClick={() => setShowComments(null)} 
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-surface w-full max-w-2xl rounded-t-[3rem] md:rounded-[3rem] shadow-2xl relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="bg-primary/10 p-4 rounded-2xl text-primary">
                    <MessageCircle size={28} />
                  </div>
                  <div>
                    <h4 className="font-headline font-black text-2xl text-primary leading-tight">{t('community.comments_title')}</h4>
                    <p className="text-[10px] font-headline font-black text-outline uppercase tracking-widest leading-none">{postComments.length} {t('community.responses')}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowComments(null)}
                  className="w-12 h-12 bg-surface-container-highest rounded-2xl flex items-center justify-center text-outline hover:text-primary transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
                {postComments.length === 0 ? (
                  <div className="py-20 text-center opacity-40">
                    <Quote className="mx-auto mb-4" size={40} />
                    <p className="font-headline font-bold text-lg">{t('community.no_comments')}</p>
                  </div>
                ) : (
                  postComments.map((comment) => (
                    <div key={comment.id} className="flex gap-4 group">
                      <img 
                        src={comment.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.authorId}`} 
                        className="w-12 h-12 rounded-xl object-cover shrink-0 shadow-sm"
                        alt={comment.authorName}
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <h5 className="font-headline font-black text-primary">{comment.authorName}</h5>
                          <span className="text-[10px] text-outline font-headline font-bold uppercase tracking-widest">
                            {new Date(comment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="bg-surface-container-highest p-5 rounded-2xl rounded-tl-none testimonial-quote">
                           <p className="text-on-surface-variant leading-relaxed font-bold">{comment.text}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 shrink-0">
                <div className="relative group">
                  <input 
                    type="text" 
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                    placeholder={t('community.write_comment')}
                    className="w-full h-16 bg-surface px-6 rounded-2xl font-headline font-bold text-lg focus:outline-primary transition-all pr-14"
                  />
                  <button 
                    onClick={handleAddComment}
                    disabled={!commentText.trim() || isSubmitting}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-primary text-on-primary rounded-xl flex items-center justify-center shadow-ambient hover:scale-105 transition-all disabled:opacity-30"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 text-on-surface">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-md" 
              onClick={() => setShowDeleteConfirm(null)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface rounded-[2.5rem] p-10 w-full max-w-sm relative z-10 shadow-2xl text-center space-y-6"
            >
              <div className="w-20 h-20 bg-tertiary/10 rounded-3xl flex items-center justify-center mx-auto text-tertiary">
                <AlertCircle size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-headline font-black text-on-surface">{t('community.delete_post_title') || 'Delete Post?'}</h3>
                <p className="text-on-surface-variant leading-relaxed">{t('community.delete_post_confirm')}</p>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => handleDeletePost(showDeleteConfirm)}
                  className="w-full py-4 bg-tertiary text-on-tertiary font-headline font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-ambient"
                >
                  {t('common.delete') || 'Delete'}
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="w-full py-4 bg-surface-container-highest text-on-surface-variant font-headline font-black uppercase tracking-widest rounded-xl hover:bg-surface-container-high transition-all"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {activeChatRecipient && (
          <ChatInterface 
            recipient={activeChatRecipient} 
            onClose={() => setActiveChatRecipient(null)} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};
