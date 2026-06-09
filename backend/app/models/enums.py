import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    member = "member"
    viewer = "viewer"


class AccountType(str, enum.Enum):
    checking = "checking"
    savings = "savings"
    cash = "cash"
    investment = "investment"


class TransactionKind(str, enum.Enum):
    income = "income"
    expense = "expense"
    transfer = "transfer"


class CategoryKind(str, enum.Enum):
    income = "income"
    expense = "expense"
    transfer = "transfer"


class AclPermission(str, enum.Enum):
    read = "read"
    write = "write"


class CycleStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    paid = "paid"


class FacturaType(str, enum.Enum):
    received = "received"
    issued = "issued"


class RecurrenceKind(str, enum.Enum):
    payable = "payable"
    receivable = "receivable"


class InvestmentType(str, enum.Enum):
    cdb = "cdb"
    lci = "lci"
    lca = "lca"
    tesouro = "tesouro"
    poupanca = "poupanca"
    fundo = "fundo"
    acoes = "acoes"
    cripto = "cripto"
    outros = "outros"


class RatePeriod(str, enum.Enum):
    monthly = "monthly"
    semiannual = "semiannual"
    annual = "annual"


class RateKind(str, enum.Enum):
    fixed = "fixed"
    percent_of_index = "percent_of_index"
    index_plus = "index_plus"


class IndexRef(str, enum.Enum):
    cdi = "cdi"
    selic = "selic"
    ipca = "ipca"
    igpm = "igpm"


class MovementType(str, enum.Enum):
    deposit = "deposit"
    withdrawal = "withdrawal"
    interest = "interest"


class Liquidity(str, enum.Enum):
    daily = "daily"
    on_maturity = "on_maturity"


class CardType(str, enum.Enum):
    credit = "credit"
    debit = "debit"


class InvoiceStatus(str, enum.Enum):
    draft = "draft"
    issued = "issued"
    sent = "sent"
    paid = "paid"
    void = "void"
