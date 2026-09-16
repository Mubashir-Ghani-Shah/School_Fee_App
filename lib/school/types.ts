export type StudentStatus = 'Active' | 'Inactive' | 'Left';
export type PaymentMethod = 'Cash' | 'Bank' | 'Online' | 'Other';
export type UserRole = 'Admin' | 'Fee Clerk' | 'Viewer';

export type Student = {
  id: string;
  rno: string;
  name: string;
  className: string;
  monthlyFee: number;
  category: string;
  status: StudentStatus;
  admissionDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type MonthlyFee = {
  id: string;
  studentId: string;
  monthKey: string;
  baseFee: number;
  additionalFee: number;
  paidAmount: number;
  createdAt: string;
  updatedAt: string;
};

export type MonthlyFeeStatus = MonthlyFee & {
  feeDue: number;
  remaining: number;
  status: 'Paid' | 'Partial' | 'Unpaid' | 'Not due';
};

export type Payment = {
  id: string;
  studentId: string;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  transactionKey: string;
  createdAt: string;
};

export type PaymentAllocation = {
  id: string;
  paymentId: string;
  studentId: string;
  monthKey: string;
  amount: number;
  beforeRemaining: number;
  afterRemaining: number;
};

export type Expense = {
  id: string;
  name: string;
  amount: number;
  expenseDate: string;
  category: string;
  notes: string;
  createdAt: string;
};

export type AdditionalFee = {
  id: string;
  studentId: string;
  monthKey: string;
  amount: number;
  reason: string;
  createdAt: string;
};

export type Settings = {
  schoolName: string;
  schoolAddress: string;
  phone: string;
  academicYear: string;
  defaultMonthlyFee: number;
  currentFeeMonthIndex: number;
  currency: string;
  role: UserRole;
};

export type AllocationPreview = {
  monthKey: string;
  applied: number;
  beforeRemaining: number;
  afterRemaining: number;
  status: 'PAID' | 'PARTIAL';
};
