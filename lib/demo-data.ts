import { CommentTemplate, FacebookGroup, Keyword, Lead, LeadFolder } from "./types";

export const groups: FacebookGroup[] = [
  {
    id: "g1",
    name: "عقارات الرياض للايجار",
    url: "https://www.facebook.com/groups/riyadh-rentals",
    location: "الرياض",
    status: "active",
    lastCheckedAt: "2026-09-16T06:00:00Z",
    newPosts: 14
  },
  {
    id: "g2",
    name: "شقق جدة وفلل للايجار",
    url: "https://www.facebook.com/groups/jeddah-rentals",
    location: "جدة",
    status: "active",
    lastCheckedAt: "2026-09-16T06:00:00Z",
    newPosts: 6
  },
  {
    id: "g3",
    name: "ملاك ومكاتب عقار الدمام",
    url: "https://www.facebook.com/groups/dammam-real-estate",
    location: "الدمام",
    status: "paused",
    lastCheckedAt: "2026-09-15T18:00:00Z",
    newPosts: 0
  }
];

export const keywords: Keyword[] = [
  { id: "k1", value: "للايجار", type: "include" },
  { id: "k2", value: "للإيجار", type: "include" },
  { id: "k3", value: "شقة", type: "include" },
  { id: "k4", value: "فيلا", type: "include" },
  { id: "k5", value: "للبيع", type: "exclude" },
  { id: "k6", value: "تم التأجير", type: "exclude" },
  { id: "k7", value: "النرجس", type: "location" },
  { id: "k8", value: "الياسمين", type: "location" },
  { id: "k9", value: "السلامة", type: "location" }
];

export const commentTemplates: CommentTemplate[] = [
  {
    id: "c1",
    title: "طلب تواصل مهذب",
    body: "السلام عليكم، مهتمين بالتفاصيل. فضلا تواصل معنا على الخاص.",
    active: true
  },
  {
    id: "c2",
    title: "طلب تفاصيل العقار",
    body: "السلام عليكم، هل العقار ما زال متاحا؟ ممكن إرسال التفاصيل وطريقة التواصل؟",
    active: true
  },
  {
    id: "c3",
    title: "عميل مناسب",
    body: "السلام عليكم، لدينا طلب مناسب لهذا العقار. فضلا راسلنا بالتفاصيل.",
    active: true
  }
];

export const leads: Lead[] = [
  {
    id: "l1",
    groupId: "g1",
    groupName: "عقارات الرياض للايجار",
    postUrl: "https://www.facebook.com/groups/riyadh-rentals/posts/1001",
    authorName: "مكتب النخبة العقاري",
    postText: "شقة للايجار حي النرجس غرفتين وصالة السعر 3500 شهري للتواصل 0551234567",
    phone: "0551234567",
    officeName: "مكتب النخبة العقاري",
    price: "3500 شهري",
    location: "النرجس",
    confidence: 100,
    offerType: "rent",
    folderIds: ["f1"],
    status: "comment_ready",
    suggestedComment: commentTemplates[0].body,
    publishedAt: "2026-09-16T05:10:00Z",
    firstSeenAt: "2026-09-16T06:02:00Z",
    duplicateHash: "r1a9p"
  },
  {
    id: "l2",
    groupId: "g2",
    groupName: "شقق جدة وفلل للايجار",
    postUrl: "https://www.facebook.com/groups/jeddah-rentals/posts/923",
    authorName: "أبو خالد",
    postText: "فيلا للايجار في السلامة دورين ومجلس وسطح. التواصل خاص.",
    location: "السلامة",
    confidence: 45,
    offerType: "rent",
    folderIds: ["f2"],
    status: "new",
    suggestedComment: commentTemplates[1].body,
    publishedAt: "2026-09-16T04:30:00Z",
    firstSeenAt: "2026-09-16T06:03:00Z",
    duplicateHash: "z3m4c"
  },
  {
    id: "l3",
    groupId: "g1",
    groupName: "عقارات الرياض للايجار",
    postUrl: "https://www.facebook.com/groups/riyadh-rentals/posts/1002",
    authorName: "وسيط عقاري الرياض",
    postText: "دور للايجار حي الياسمين 4800 ريال شهري 0509876543",
    phone: "0509876543",
    officeName: "وسيط عقاري الرياض",
    price: "4800 ريال شهري",
    location: "الياسمين",
    confidence: 100,
    offerType: "rent",
    folderIds: [],
    status: "contacted",
    suggestedComment: commentTemplates[2].body,
    publishedAt: "2026-09-16T03:50:00Z",
    firstSeenAt: "2026-09-16T06:04:00Z",
    duplicateHash: "m7q2x"
  }
];

export const leadFolders: LeadFolder[] = [
  { id: "f1", name: "متابعة اليوم", count: 1 },
  { id: "f2", name: "عميل جاهز", count: 1 }
];
